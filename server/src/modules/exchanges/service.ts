import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { ApiError } from "../../middleware/apiError.js";
import { catalogProvider } from "../catalog/localDbCatalogProvider.js";
import { getUserCopies, toAvailabilityTagged, type CopyWithDetails } from "../collection/service.js";
import { removeImageRows } from "../images/service.js";
import { unlinkImages } from "../images/store.js";
import {
  allowedActions,
  applyExchangeAction,
  isOpenStatus,
  selectCopiesForProposal,
  type ExchangeAction,
  type ExchangeState,
  type ExchangeStatus,
  type OfferableCopy,
  type ParticipantRole,
} from "../../domain/exchange.js";
import { findDonationCandidate, findMutualTradeCandidate } from "../../domain/matching.js";
import { calculateProgress, completionPercentageOf, ownedCountAfterTransfer } from "../../domain/progress.js";

export type ExchangeType = "MUTUAL_TRADE" | "DONATION";

export interface ExchangeCardView {
  number: string;
  name: string;
  rarity: string | null;
  condition: string | null;
}

export interface ExchangeView {
  id: string;
  type: ExchangeType;
  status: ExchangeStatus;
  role: "proposer" | "counterparty";
  set: { id: string; name: string; code: string };
  other_collector: { display_name: string; ref: string };
  you_give: ExchangeCardView[];
  you_receive: ExchangeCardView[];
  you_confirmed: boolean;
  they_confirmed: boolean;
  actions: ExchangeAction[];
  /**
   * How each person's set would look if this open exchange finished now.
   * Null once it is declined, cancelled, or completed — those rows do not
   * store the counts from when they were proposed.
   */
  projected_completion: {
    yours: { before: number; after: number };
    theirs: { before: number; after: number };
  } | null;
  created_at: string;
  updated_at: string;
}

const exchangeInclude = {
  set: { select: { id: true, name: true, code: true } },
  proposer: { select: { id: true, displayName: true, publicId: true } },
  counterparty: { select: { id: true, displayName: true, publicId: true } },
  lines: { orderBy: { collectibleNumber: "asc" as const } },
} satisfies Prisma.ExchangeInclude;

type ExchangeRow = Prisma.ExchangeGetPayload<{ include: typeof exchangeInclude }>;

interface LineDraft {
  copyId: string;
  fromUserId: string;
  toUserId: string;
  collectibleNumber: string;
  collectibleName: string;
  rarity: string | null;
  condition: string | null;
}

function toState(row: {
  status: string;
  proposerConfirmedAt: Date | null;
  counterpartyConfirmedAt: Date | null;
}): ExchangeState {
  return {
    status: row.status as ExchangeStatus,
    proposerConfirmed: row.proposerConfirmedAt != null,
    counterpartyConfirmed: row.counterpartyConfirmedAt != null,
  };
}

function roleFor(row: { proposerId: string; counterpartyId: string }, userId: string): ParticipantRole | null {
  if (row.proposerId === userId) return "PROPOSER";
  if (row.counterpartyId === userId) return "COUNTERPARTY";
  return null;
}

function toCard(line: {
  collectibleNumber: string;
  collectibleName: string;
  rarity: string | null;
  condition: string | null;
}): ExchangeCardView {
  return {
    number: line.collectibleNumber,
    name: line.collectibleName,
    rarity: line.rarity,
    condition: line.condition,
  };
}

/** Explicit DTO. Never includes email, account id, or a UserCopy id. */
export function toExchangeView(row: ExchangeRow, viewerId: string): ExchangeView {
  const role = roleFor(row, viewerId);
  if (!role) {
    throw ApiError.notFound("Exchange not found");
  }
  const state = toState(row);
  const other = role === "PROPOSER" ? row.counterparty : row.proposer;
  const youConfirmed = role === "PROPOSER" ? state.proposerConfirmed : state.counterpartyConfirmed;
  const theyConfirmed = role === "PROPOSER" ? state.counterpartyConfirmed : state.proposerConfirmed;

  return {
    id: row.id,
    type: row.type as ExchangeType,
    status: state.status,
    role: role === "PROPOSER" ? "proposer" : "counterparty",
    set: { id: row.set.id, name: row.set.name, code: row.set.code },
    other_collector: { display_name: other.displayName, ref: other.publicId },
    you_give: row.lines.filter((line) => line.fromUserId === viewerId).map(toCard),
    you_receive: row.lines.filter((line) => line.toUserId === viewerId).map(toCard),
    you_confirmed: youConfirmed,
    they_confirmed: theyConfirmed,
    actions: allowedActions(state, role),
    projected_completion: null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

type ExchangeDb = Prisma.TransactionClient | typeof prisma;

interface ProjectionCache {
  totals: Map<string, number>;
  quantities: Map<string, Map<string, number>>;
}

function newProjectionCache(): ProjectionCache {
  return { totals: new Map(), quantities: new Map() };
}

function projectSide(
  total: number,
  quantities: ReadonlyMap<string, number>,
  received: string[],
  given: string[],
): { before: number; after: number } {
  let ownedCount = 0;
  for (const quantity of quantities.values()) {
    if (quantity > 0) ownedCount += 1;
  }
  const afterCount = ownedCountAfterTransfer(total, ownedCount, quantities, received, given);
  return {
    before: completionPercentageOf(ownedCount, total),
    after: completionPercentageOf(afterCount, total),
  };
}

async function setTotal(setId: string, cache: ProjectionCache): Promise<number> {
  const cached = cache.totals.get(setId);
  if (cached !== undefined) return cached;
  const collectibles = await catalogProvider.listCollectibles(setId);
  cache.totals.set(setId, collectibles.length);
  return collectibles.length;
}

async function quantitiesByNumber(userId: string, setId: string, db: ExchangeDb, cache: ProjectionCache) {
  const key = `${userId}:${setId}`;
  const cached = cache.quantities.get(key);
  if (cached) return cached;
  const copies = await getUserCopies(userId, setId, db);
  const quantities = new Map<string, number>();
  for (const copy of copies) {
    const number = copy.variant.collectible.number;
    quantities.set(number, (quantities.get(number) ?? 0) + 1);
  }
  cache.quantities.set(key, quantities);
  return quantities;
}

/** Fills the projection for an open exchange. Closed exchanges stay null. */
async function withProjection(
  row: ExchangeRow,
  viewerId: string,
  db: ExchangeDb,
  cache: ProjectionCache,
): Promise<ExchangeView> {
  const view = toExchangeView(row, viewerId);
  if (view.status !== "PROPOSED" && view.status !== "ACCEPTED") return view;

  const total = await setTotal(row.setId, cache);
  const otherId = row.proposerId === viewerId ? row.counterpartyId : row.proposerId;
  const yours = await quantitiesByNumber(viewerId, row.setId, db, cache);
  const theirs = await quantitiesByNumber(otherId, row.setId, db, cache);
  const youGive = row.lines.filter((line) => line.fromUserId === viewerId).map((line) => line.collectibleNumber);
  const youReceive = row.lines.filter((line) => line.toUserId === viewerId).map((line) => line.collectibleNumber);

  return {
    ...view,
    projected_completion: {
      yours: projectSide(total, yours, youReceive, youGive),
      theirs: projectSide(total, theirs, youGive, youReceive),
    },
  };
}

function copiesToOfferable(copies: CopyWithDetails[]): OfferableCopy[] {
  return copies.map((copy) => ({
    id: copy.id,
    ownerId: copy.ownerId,
    collectibleId: copy.variant.collectible.id,
    availability: copy.availability as OfferableCopy["availability"],
    reserved: copy.reservedByExchangeId != null,
    createdAtMs: copy.createdAt.getTime(),
  }));
}

function lineFromCopy(copy: CopyWithDetails, fromUserId: string, toUserId: string): LineDraft {
  return {
    copyId: copy.id,
    fromUserId,
    toUserId,
    collectibleNumber: copy.variant.collectible.number,
    collectibleName: copy.variant.collectible.name,
    rarity: copy.variant.collectible.rarity,
    condition: copy.condition,
  };
}

/**
 * Recomputes the same candidate the Matches page showed, then pins one
 * concrete copy per collectible. Returns null when that candidate is gone
 * or a needed copy is already reserved — the caller turns that into 409.
 * The client never supplies the card list.
 */
function buildProposalLines(
  type: ExchangeType,
  proposerId: string,
  counterpartyId: string,
  myCopies: CopyWithDetails[],
  theirCopies: CopyWithDetails[],
  collectibleIds: { id: string }[],
): LineDraft[] | null {
  const myTagged = toAvailabilityTagged(myCopies);
  const theirTagged = toAvailabilityTagged(theirCopies);
  const myProgress = calculateProgress(
    collectibleIds,
    myCopies.map((copy) => ({ collectibleId: copy.variant.collectible.id })),
  );
  const theirProgress = calculateProgress(
    collectibleIds,
    theirCopies.map((copy) => ({ collectibleId: copy.variant.collectible.id })),
  );
  const myById = new Map(myCopies.map((copy) => [copy.id, copy]));
  const theirById = new Map(theirCopies.map((copy) => [copy.id, copy]));

  if (type === "MUTUAL_TRADE") {
    const candidate = findMutualTradeCandidate(
      myProgress.missingCollectibleIds,
      theirProgress.missingCollectibleIds,
      myTagged,
      theirTagged,
    );
    if (!candidate) return null;
    const iGive = selectCopiesForProposal(copiesToOfferable(myCopies), candidate.otherCollectorReceives, "TRADE");
    const theyGive = selectCopiesForProposal(copiesToOfferable(theirCopies), candidate.currentUserReceives, "TRADE");
    if (!iGive || !theyGive) return null;
    return [
      ...iGive.map((selected) => lineFromCopy(myById.get(selected.id)!, proposerId, counterpartyId)),
      ...theyGive.map((selected) => lineFromCopy(theirById.get(selected.id)!, counterpartyId, proposerId)),
    ];
  }

  const donatedIds = findDonationCandidate(myProgress.missingCollectibleIds, theirTagged);
  if (donatedIds.length === 0) return null;
  const theyGive = selectCopiesForProposal(copiesToOfferable(theirCopies), donatedIds, "GIVE_AWAY");
  if (!theyGive) return null;
  return theyGive.map((selected) => lineFromCopy(theirById.get(selected.id)!, counterpartyId, proposerId));
}

function rejectionMessage(action: ExchangeAction): string {
  switch (action) {
    case "accept":
    case "decline":
      return "Only the other collector can respond, and only while the exchange is waiting for an answer";
    case "cancel":
      return "This exchange can no longer be cancelled";
    case "confirm":
      return "You can confirm only after both collectors have accepted";
  }
}

async function findOpenDuplicate(
  db: Prisma.TransactionClient | typeof prisma,
  setId: string,
  type: ExchangeType,
  proposerId: string,
  counterpartyId: string,
) {
  return db.exchange.findFirst({
    where: {
      setId,
      type,
      status: { in: ["PROPOSED", "ACCEPTED"] },
      OR: [
        { proposerId, counterpartyId },
        { proposerId: counterpartyId, counterpartyId: proposerId },
      ],
    },
    select: { id: true },
  });
}

export async function listExchangesForUser(userId: string): Promise<ExchangeView[]> {
  const rows = await prisma.exchange.findMany({
    where: { OR: [{ proposerId: userId }, { counterpartyId: userId }] },
    include: exchangeInclude,
    orderBy: { updatedAt: "desc" },
  });
  const cache = newProjectionCache();
  const views: ExchangeView[] = [];
  for (const row of rows) views.push(await withProjection(row, userId, prisma, cache));
  return views;
}

export async function getExchangeForUser(userId: string, exchangeId: string): Promise<ExchangeView> {
  const row = await prisma.exchange.findUnique({ where: { id: exchangeId }, include: exchangeInclude });
  if (!row || !roleFor(row, userId)) {
    throw ApiError.notFound("Exchange not found");
  }
  return withProjection(row, userId, prisma, newProjectionCache());
}

export async function proposeExchange(
  proposerId: string,
  input: { setId: string; collectorRef: string; type: ExchangeType },
): Promise<ExchangeView> {
  const set = await catalogProvider.getSet(input.setId);
  if (!set) throw ApiError.notFound("Set not found");

  const counterparty = await prisma.user.findUnique({ where: { publicId: input.collectorRef } });
  if (!counterparty) throw ApiError.notFound("Collector not found");
  if (counterparty.id === proposerId) {
    throw ApiError.badRequest("You can't propose an exchange with yourself");
  }

  const collectibles = await catalogProvider.listCollectibles(input.setId);
  const collectibleIds = collectibles.map((collectible) => ({ id: collectible.id }));

  return prisma.$transaction(async (tx) => {
    const duplicate = await findOpenDuplicate(tx, input.setId, input.type, proposerId, counterparty.id);
    if (duplicate) {
      throw ApiError.conflict("An open exchange already exists for this match");
    }

    const myCopies = await getUserCopies(proposerId, input.setId, tx);
    const theirCopies = await getUserCopies(counterparty.id, input.setId, tx);
    const lines = buildProposalLines(input.type, proposerId, counterparty.id, myCopies, theirCopies, collectibleIds);
    if (!lines || lines.length === 0) {
      throw ApiError.conflict("That exchange is no longer available");
    }

    const created = await tx.exchange.create({
      data: {
        type: input.type,
        status: "PROPOSED",
        setId: input.setId,
        proposerId,
        counterpartyId: counterparty.id,
        lines: { create: lines },
      },
      include: exchangeInclude,
    });

    const expectedAvailability = input.type === "DONATION" ? "GIVE_AWAY" : "TRADE";
    for (const line of lines) {
      const reserved = await tx.userCopy.updateMany({
        where: {
          id: line.copyId,
          ownerId: line.fromUserId,
          availability: expectedAvailability,
          reservedByExchangeId: null,
        },
        data: { reservedByExchangeId: created.id },
      });
      if (reserved.count !== 1) {
        throw ApiError.conflict("That exchange is no longer available");
      }
    }

    return withProjection(created, proposerId, tx, newProjectionCache());
  });
}

export async function actOnExchange(userId: string, exchangeId: string, action: ExchangeAction): Promise<ExchangeView> {
  const outcome = await prisma.$transaction(async (tx) => {
    const row = await tx.exchange.findUnique({ where: { id: exchangeId }, include: exchangeInclude });
    if (!row || !roleFor(row, userId)) {
      throw ApiError.notFound("Exchange not found");
    }
    const role = roleFor(row, userId)!;
    const before = toState(row);
    const result = applyExchangeAction(before, role, action);
    if (!result.ok) throw ApiError.conflict(rejectionMessage(action));
    if (
      result.state.status === before.status &&
      result.state.proposerConfirmed === before.proposerConfirmed &&
      result.state.counterpartyConfirmed === before.counterpartyConfirmed
    ) {
      return { view: await withProjection(row, userId, tx, newProjectionCache()), removedImageIds: [] as string[] };
    }

    const now = new Date();
    let removedImageIds: string[] = [];
    if (result.state.status === "COMPLETED") {
      const copyIds = row.lines.map((line) => line.copyId).filter((id): id is string => id != null);
      // Photos stay with the person who took them. They are not proof of the card, and they do not move.
      removedImageIds = await removeImageRows(tx, copyIds);
      for (const line of row.lines) {
        if (!line.copyId) throw ApiError.conflict("A card in this exchange is no longer available");
        const moved = await tx.userCopy.updateMany({
          where: { id: line.copyId, ownerId: line.fromUserId, reservedByExchangeId: row.id },
          data: { ownerId: line.toUserId, availability: "KEEP", reservedByExchangeId: null },
        });
        if (moved.count !== 1) throw ApiError.conflict("A card in this exchange is no longer available");
      }
    } else if (!isOpenStatus(result.state.status)) {
      await tx.userCopy.updateMany({
        where: { reservedByExchangeId: row.id },
        data: { reservedByExchangeId: null },
      });
    }

    const updated = await tx.exchange.update({
      where: { id: row.id },
      data: {
        status: result.state.status,
        proposerConfirmedAt: result.state.proposerConfirmed ? (row.proposerConfirmedAt ?? now) : null,
        counterpartyConfirmedAt: result.state.counterpartyConfirmed ? (row.counterpartyConfirmedAt ?? now) : null,
        closedAt: isOpenStatus(result.state.status) ? null : (row.closedAt ?? now),
      },
      include: exchangeInclude,
    });
    return { view: await withProjection(updated, userId, tx, newProjectionCache()), removedImageIds };
  });
  await unlinkImages(outcome.removedImageIds);
  return outcome.view;
}
