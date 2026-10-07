/**
 * Identifies WHICH collectibles could move between two collectors for a
 * shared Set — candidate generation only. Scoring a candidate
 * (domain/tradeScore.ts) is a deliberately separate concern: this module
 * never computes a score, and tradeScore.ts never decides eligibility.
 *
 * TRADE and GIVE_AWAY are tracked as fully independent pools, per copy:
 *  - A mutual trade only ever draws from TRADE-availability copies, on
 *    both sides. A copy marked GIVE_AWAY is a commitment to give it away
 *    unconditionally and is never used as trade leverage.
 *  - A donation only ever draws from the OTHER collector's
 *    GIVE_AWAY-availability copies, matched against the current user's
 *    missing cards. It is one-way by construction — there is no code
 *    path in this file that promotes a donation into a trade, or a
 *    trade into a donation.
 * KEEP and SELL copies are never read by either function below.
 */

export type CopyAvailability = "KEEP" | "TRADE" | "SELL" | "GIVE_AWAY";

export interface AvailabilityTaggedCopy {
  collectibleId: string;
  availability: CopyAvailability;
}

/**
 * Distinct collectible ids with at least one copy in the given
 * availability state. A collectible only needs to be proposed once no
 * matter how many eligible physical copies exist — this is what keeps
 * "cardsReceived" a count of collectibles, not of copies, and is why
 * owning e.g. two TRADE copies of the same card never lets it be
 * over-allocated across a proposal.
 */
function distinctCollectiblesWithAvailability(
  copies: AvailabilityTaggedCopy[],
  availability: "TRADE" | "GIVE_AWAY",
): Set<string> {
  const ids = new Set<string>();
  for (const copy of copies) {
    if (copy.availability === availability) ids.add(copy.collectibleId);
  }
  return ids;
}

export interface MutualTradeCandidate {
  /** Collectibles the current user would receive — from the other collector's TRADE copies, filtered to the current user's missing set. */
  currentUserReceives: string[];
  /** Collectibles the other collector would receive — from the current user's TRADE copies, filtered to the other collector's missing set. */
  otherCollectorReceives: string[];
}

/**
 * A mutual trade candidate exists only when BOTH directions are
 * non-empty. One-sided TRADE availability produces no candidate at all
 * — never silently reframed as a donation or a one-way trade.
 */
export function findMutualTradeCandidate(
  currentUserMissingIds: Iterable<string>,
  otherCollectorMissingIds: Iterable<string>,
  currentUserCopies: AvailabilityTaggedCopy[],
  otherCollectorCopies: AvailabilityTaggedCopy[],
): MutualTradeCandidate | null {
  const currentMissing = new Set(currentUserMissingIds);
  const otherMissing = new Set(otherCollectorMissingIds);

  const otherTradeable = distinctCollectiblesWithAvailability(otherCollectorCopies, "TRADE");
  const currentTradeable = distinctCollectiblesWithAvailability(currentUserCopies, "TRADE");

  const currentUserReceives = [...otherTradeable].filter((id) => currentMissing.has(id));
  const otherCollectorReceives = [...currentTradeable].filter((id) => otherMissing.has(id));

  if (currentUserReceives.length === 0 || otherCollectorReceives.length === 0) {
    return null;
  }
  return { currentUserReceives, otherCollectorReceives };
}

/**
 * Collectibles the other collector has marked GIVE_AWAY that the
 * current user is missing. Returns [] (never null) when there is
 * nothing to donate — callers treat an empty array as "no donation
 * candidate for this pair."
 */
export function findDonationCandidate(
  currentUserMissingIds: Iterable<string>,
  otherCollectorCopies: AvailabilityTaggedCopy[],
): string[] {
  const currentMissing = new Set(currentUserMissingIds);
  const offered = distinctCollectiblesWithAvailability(otherCollectorCopies, "GIVE_AWAY");
  return [...offered].filter((id) => currentMissing.has(id));
}
