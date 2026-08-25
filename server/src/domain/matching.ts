/**
 * Pure matching-engine logic. Given two users' missing-collectible sets
 * for a shared Set, and each user's "offerable" copies (TRADE or
 * GIVE_AWAY — never KEEP, never SELL in V0), compute what each side can
 * receive/offer and any one-way donation opportunities.
 */

export type OfferableAvailability = "TRADE" | "GIVE_AWAY";

export interface OfferableCopy {
  collectibleId: string;
  availability: OfferableAvailability;
}

export interface MatchOffer {
  collectibleId: string;
  availability: OfferableAvailability;
}

export interface MatchResult {
  /** Collectibles the requesting user (A) needs and the other user (B) can provide. */
  youCanReceive: MatchOffer[];
  /** Collectibles the other user (B) needs and the requesting user (A) can provide. */
  youCanOffer: MatchOffer[];
  /**
   * One-way GIVE_AWAY opportunities within youCanReceive. Computed
   * independently of youCanOffer so they surface even when A has
   * nothing to trade back.
   */
  donationOpportunities: MatchOffer[];
  isMutualMatch: boolean;
}

function dedupeByCollectible(copies: OfferableCopy[]): MatchOffer[] {
  const seen = new Map<string, MatchOffer>();
  for (const copy of copies) {
    if (!seen.has(copy.collectibleId)) {
      seen.set(copy.collectibleId, { collectibleId: copy.collectibleId, availability: copy.availability });
    } else if (copy.availability === "GIVE_AWAY") {
      // Prefer surfacing a GIVE_AWAY over a TRADE for the same collectible.
      seen.set(copy.collectibleId, { collectibleId: copy.collectibleId, availability: copy.availability });
    }
  }
  return [...seen.values()];
}

export function computeMatch(
  aMissingCollectibleIds: Iterable<string>,
  bMissingCollectibleIds: Iterable<string>,
  aOfferableCopies: OfferableCopy[],
  bOfferableCopies: OfferableCopy[],
): MatchResult {
  const aMissing = new Set(aMissingCollectibleIds);
  const bMissing = new Set(bMissingCollectibleIds);

  const youCanReceive = dedupeByCollectible(bOfferableCopies.filter((copy) => aMissing.has(copy.collectibleId)));
  const youCanOffer = dedupeByCollectible(aOfferableCopies.filter((copy) => bMissing.has(copy.collectibleId)));
  const donationOpportunities = youCanReceive.filter((offer) => offer.availability === "GIVE_AWAY");

  return {
    youCanReceive,
    youCanOffer,
    donationOpportunities,
    isMutualMatch: youCanReceive.length > 0 && youCanOffer.length > 0,
  };
}

/** Estimate a user's set completion if they received the given additional collectibles. */
export function estimateCompletionAfter(
  totalCount: number,
  currentOwnedCount: number,
  additionalCollectibleIds: string[],
): number {
  if (totalCount === 0) return 0;
  const newOwnedCount = Math.min(totalCount, currentOwnedCount + additionalCollectibleIds.length);
  return Math.round((newOwnedCount / totalCount) * 1000) / 10;
}
