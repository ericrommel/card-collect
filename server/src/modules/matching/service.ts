import { prisma } from "../../db.js";
import { catalogProvider } from "../catalog/localDbCatalogProvider.js";
import { getUserCopies } from "../collection/service.js";
import { calculateProgress } from "../../domain/progress.js";
import { findDonationCandidate, findMutualTradeCandidate, type AvailabilityTaggedCopy } from "../../domain/matching.js";
import {
  compareMatches,
  scoreDonation,
  scoreMutualTrade,
  type CollectibleRef,
  type MatchType,
  type ScoredMatch,
  type SideProgress,
} from "../../domain/tradeScore.js";
import { ApiError } from "../../middleware/apiError.js";

export interface PublicSideProgress {
  cards_received: number;
  completion_before: number;
  completion_after: number;
  completion_gain: number;
}

export interface PublicMatch {
  collector: { display_name: string };
  type: MatchType;
  score: number;
  current_user: PublicSideProgress;
  /** MUTUAL_TRADE only. */
  other_collector?: PublicSideProgress;
  /** MUTUAL_TRADE only. */
  balance?: { difference: number };
  proposed_exchange: {
    you_receive: CollectibleRef[];
    /** Always [] for DONATION — never a fabricated reciprocal side. */
    they_receive: CollectibleRef[];
  };
}

function toAvailabilityTagged(copies: Awaited<ReturnType<typeof getUserCopies>>): AvailabilityTaggedCopy[] {
  return copies.map((c) => ({
    collectibleId: c.variant.collectible.id,
    availability: c.availability as AvailabilityTaggedCopy["availability"],
  }));
}

function toPublicSide(side: SideProgress): PublicSideProgress {
  return {
    cards_received: side.cardsReceived,
    completion_before: side.completionBefore,
    completion_after: side.completionAfter,
    completion_gain: side.completionGain,
  };
}

function toPublicMatch(match: ScoredMatch): PublicMatch {
  return {
    collector: { display_name: match.collectorDisplayName },
    type: match.type,
    score: match.score,
    current_user: toPublicSide(match.currentUser),
    ...(match.otherCollector ? { other_collector: toPublicSide(match.otherCollector) } : {}),
    ...(match.balance ? { balance: match.balance } : {}),
    proposed_exchange: {
      you_receive: match.proposedExchange.currentUserReceives,
      they_receive: match.proposedExchange.otherCollectorReceives,
    },
  };
}

/**
 * Computes and ranks candidate exchanges between the requesting user and
 * every other collector, scoped to one Set. Only "safe" fields (display
 * name, catalog collectible identifiers, progress numbers) ever leave
 * this function — no email, user id, UserCopy id, or contact info. See
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
  const mySnapshot = { totalCount: myProgress.totalCount, ownedCount: myProgress.ownedCount };
  const myTaggedCopies = toAvailabilityTagged(myCopies);

  // Deterministic base enumeration; final ordering is fully decided by
  // compareMatches below regardless of this query's row order.
  const otherUsers = await prisma.user.findMany({ where: { id: { not: userId } }, orderBy: { id: "asc" } });

  const scored: ScoredMatch[] = [];

  for (const other of otherUsers) {
    const otherCopies = await getUserCopies(other.id, setId);
    const otherProgress = calculateProgress(
      collectibles.map((c) => ({ id: c.id })),
      otherCopies.map((c) => ({ collectibleId: c.variant.collectible.id })),
    );
    const otherSnapshot = { totalCount: otherProgress.totalCount, ownedCount: otherProgress.ownedCount };
    const otherTaggedCopies = toAvailabilityTagged(otherCopies);

    const tradeCandidate = findMutualTradeCandidate(
      myProgress.missingCollectibleIds,
      otherProgress.missingCollectibleIds,
      myTaggedCopies,
      otherTaggedCopies,
    );
    if (tradeCandidate) {
      const breakdown = scoreMutualTrade(mySnapshot, otherSnapshot, tradeCandidate, collectiblesById);
      scored.push({ ...breakdown, collectorDisplayName: other.displayName });
    }

    const donationIds = findDonationCandidate(myProgress.missingCollectibleIds, otherTaggedCopies);
    if (donationIds.length > 0) {
      const breakdown = scoreDonation(mySnapshot, donationIds, collectiblesById);
      scored.push({ ...breakdown, collectorDisplayName: other.displayName });
    }
  }

  scored.sort(compareMatches);

  return scored.map(toPublicMatch);
}
