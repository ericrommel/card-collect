import { prisma } from "../../db.js";
import { catalogProvider } from "../catalog/localDbCatalogProvider.js";
import { getUserCopies, toAvailabilityTagged, type CopyWithDetails } from "../collection/service.js";
import { calculateProgress, type ProgressResult } from "../../domain/progress.js";
import { previewOfferedCopies, type PreviewCopy } from "../../domain/exchange.js";
import { findDonationCandidate, findMutualTradeCandidate } from "../../domain/matching.js";
import {
  compareMatches,
  scoreDonation,
  scoreMutualTrade,
  type CollectibleRef,
  type MatchType,
  type ScoredMatch,
  type SetProgressSnapshot,
  type SideProgress,
} from "../../domain/tradeScore.js";
import { ApiError } from "../../middleware/apiError.js";

function snapshotFromProgress(progress: ProgressResult): SetProgressSnapshot {
  const quantityByCollectible = new Map<string, number>();
  for (const entry of progress.entries) {
    if (entry.ownedQuantity > 0) quantityByCollectible.set(entry.collectibleId, entry.ownedQuantity);
  }
  return { totalCount: progress.totalCount, ownedCount: progress.ownedCount, quantityByCollectible };
}

export interface PublicSideProgress {
  cards_received: number;
  completion_before: number;
  completion_after: number;
  completion_gain: number;
}

export interface PublicMatch {
  collector: { display_name: string; ref: string };
  type: MatchType;
  score: number;
  current_user: PublicSideProgress;
  /** MUTUAL_TRADE only. */
  other_collector?: PublicSideProgress;
  /** MUTUAL_TRADE only. */
  balance?: { difference: number };
  proposed_exchange: {
    you_receive: MatchCardRef[];
    /** Always [] for DONATION — never a fabricated reciprocal side. */
    they_receive: MatchCardRef[];
  };
  /** Present when an open exchange of this type already exists with this collector. */
  open_exchange_id?: string;
}

/**
 * Catalog card. `condition` is present when the physical copy this match
 * would use could be named. It is omitted when that copy could not be
 * chosen, so a missing field is not the same as an unset note.
 */
export interface MatchCardRef extends CollectibleRef {
  condition?: string | null;
}

/**
 * Copies this pair may still be offered. A copy reserved for someone else
 * is left out, so its condition cannot appear on this match.
 */
function copiesForPreview(copies: CopyWithDetails[], allowedReservationIds: ReadonlySet<string>): PreviewCopy[] {
  return copies
    .filter((copy) => copy.reservedByExchangeId == null || allowedReservationIds.has(copy.reservedByExchangeId))
    .map((copy) => ({
      id: copy.id,
      ownerId: copy.ownerId,
      collectibleId: copy.variant.collectible.id,
      availability: copy.availability as PreviewCopy["availability"],
      reserved: copy.reservedByExchangeId != null,
      createdAtMs: copy.createdAt.getTime(),
      condition: copy.condition,
    }));
}

/**
 * Attaches the condition of the copy previewOfferedCopies chooses.
 * When that copy cannot be named, the cards stay unlabeled rather than
 * claiming the condition was never set. Copy ids are not copied onto the card.
 */
function withConditions(
  refs: CollectibleRef[],
  copies: PreviewCopy[],
  availability: "TRADE" | "GIVE_AWAY",
): MatchCardRef[] {
  if (refs.length === 0) return refs;
  const preview = previewOfferedCopies(
    copies,
    refs.map((ref) => ref.id),
    availability,
  );
  if (!preview) return refs;
  return refs.map((ref, index) => ({ ...ref, condition: preview[index].condition }));
}

function toPublicSide(side: SideProgress): PublicSideProgress {
  return {
    cards_received: side.cardsReceived,
    completion_before: side.completionBefore,
    completion_after: side.completionAfter,
    completion_gain: side.completionGain,
  };
}

function toPublicMatch(
  match: ScoredMatch,
  cards: { youReceive: MatchCardRef[]; theyReceive: MatchCardRef[] },
  openExchangeId?: string,
): PublicMatch {
  return {
    collector: { display_name: match.collectorDisplayName, ref: match.collectorRef ?? "" },
    type: match.type,
    score: match.score,
    current_user: toPublicSide(match.currentUser),
    ...(match.otherCollector ? { other_collector: toPublicSide(match.otherCollector) } : {}),
    ...(match.balance ? { balance: match.balance } : {}),
    proposed_exchange: {
      you_receive: cards.youReceive,
      they_receive: cards.theyReceive,
    },
    ...(openExchangeId ? { open_exchange_id: openExchangeId } : {}),
  };
}

/**
 * Computes and ranks candidate exchanges between the requesting user and
 * every other collector, scoped to one Set. Fields that leave this
 * function are display name, an opaque collector ref (not the account
 * id), catalog collectible identifiers, the condition of the copy that
 * would be used, and progress numbers — no email, user id, UserCopy id,
 * or contact info. See
 * docs/architecture.md#trade-score-formula for how `score` is derived,
 * and domain/tradeScore.ts#compareMatches for the ranking/tie-break
 * rules applied below.
 */
export async function computeMatchesForUser(userId: string, setId: string): Promise<PublicMatch[]> {
  const set = await catalogProvider.getSet(setId);
  if (!set) throw ApiError.notFound("Set not found");

  const collectibles = await catalogProvider.listCollectibles(setId);
  const collectiblesById = new Map<string, CollectibleRef>(
    collectibles.map((c) => [c.id, { id: c.id, number: c.number, name: c.name, rarity: c.rarity }]),
  );

  const myCopies = await getUserCopies(userId, setId);
  const myProgress = calculateProgress(
    collectibles.map((c) => ({ id: c.id })),
    myCopies.map((c) => ({ collectibleId: c.variant.collectible.id })),
  );
  const mySnapshot = snapshotFromProgress(myProgress);

  // Deterministic base enumeration; final ordering is fully decided by
  // compareMatches below regardless of this query's row order.
  const otherUsers = await prisma.user.findMany({ where: { id: { not: userId } }, orderBy: { id: "asc" } });

  const openExchanges = await prisma.exchange.findMany({
    where: {
      setId,
      status: { in: ["PROPOSED", "ACCEPTED"] },
      OR: [{ proposerId: userId }, { counterpartyId: userId }],
    },
    select: { id: true, type: true, proposerId: true, counterpartyId: true },
  });
  const openExchangeByKey = new Map<string, string>();
  for (const exchange of openExchanges) {
    const otherId = exchange.proposerId === userId ? exchange.counterpartyId : exchange.proposerId;
    openExchangeByKey.set(`${otherId}:${exchange.type}`, exchange.id);
  }

  const ranked: {
    scored: ScoredMatch;
    youReceive: MatchCardRef[];
    theyReceive: MatchCardRef[];
    openExchangeId?: string;
  }[] = [];

  for (const other of otherUsers) {
    const otherCopies = await getUserCopies(other.id, setId);
    const otherProgress = calculateProgress(
      collectibles.map((c) => ({ id: c.id })),
      otherCopies.map((c) => ({ collectibleId: c.variant.collectible.id })),
    );
    const otherSnapshot = snapshotFromProgress(otherProgress);
    const pairExchangeIds = new Set(
      openExchanges
        .filter((exchange) => exchange.proposerId === other.id || exchange.counterpartyId === other.id)
        .map((exchange) => exchange.id),
    );
    const myTaggedCopies = toAvailabilityTagged(myCopies, pairExchangeIds);
    const otherTaggedCopies = toAvailabilityTagged(otherCopies, pairExchangeIds);
    const myPreviewCopies = copiesForPreview(myCopies, pairExchangeIds);
    const theirPreviewCopies = copiesForPreview(otherCopies, pairExchangeIds);

    const tradeCandidate = findMutualTradeCandidate(
      myProgress.missingCollectibleIds,
      otherProgress.missingCollectibleIds,
      myTaggedCopies,
      otherTaggedCopies,
    );
    if (tradeCandidate) {
      const breakdown = scoreMutualTrade(mySnapshot, otherSnapshot, tradeCandidate, collectiblesById);
      ranked.push({
        scored: { ...breakdown, collectorDisplayName: other.displayName, collectorRef: other.publicId },
        youReceive: withConditions(breakdown.proposedExchange.currentUserReceives, theirPreviewCopies, "TRADE"),
        theyReceive: withConditions(breakdown.proposedExchange.otherCollectorReceives, myPreviewCopies, "TRADE"),
        openExchangeId: openExchangeByKey.get(`${other.id}:MUTUAL_TRADE`),
      });
    }

    const donationIds = findDonationCandidate(myProgress.missingCollectibleIds, otherTaggedCopies);
    if (donationIds.length > 0) {
      const breakdown = scoreDonation(mySnapshot, donationIds, collectiblesById);
      ranked.push({
        scored: { ...breakdown, collectorDisplayName: other.displayName, collectorRef: other.publicId },
        youReceive: withConditions(breakdown.proposedExchange.currentUserReceives, theirPreviewCopies, "GIVE_AWAY"),
        theyReceive: breakdown.proposedExchange.otherCollectorReceives,
        openExchangeId: openExchangeByKey.get(`${other.id}:DONATION`),
      });
    }
  }

  ranked.sort((a, b) => compareMatches(a.scored, b.scored));

  return ranked.map((entry) =>
    toPublicMatch(entry.scored, { youReceive: entry.youReceive, theyReceive: entry.theyReceive }, entry.openExchangeId),
  );
}
