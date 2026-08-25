import { prisma } from "../../db.js";
import { catalogProvider } from "../catalog/localDbCatalogProvider.js";
import { getUserCopies, isOfferable } from "../collection/service.js";
import { calculateProgress } from "../../domain/progress.js";
import { computeMatch, estimateCompletionAfter, type MatchOffer, type OfferableCopy } from "../../domain/matching.js";
import { ApiError } from "../../middleware/apiError.js";
import type { CatalogCollectible } from "../catalog/catalogProvider.js";

export interface PublicMatchOffer {
  collectible: {
    id: string;
    number: string;
    name: string;
    rarity: string | null;
  };
  availability: "TRADE" | "GIVE_AWAY";
}

export interface CollectorMatch {
  collector: { display_name: string };
  is_mutual_match: boolean;
  you_can_receive: PublicMatchOffer[];
  you_can_offer: PublicMatchOffer[];
  donation_opportunities: PublicMatchOffer[];
  set_completion_before: number;
  set_completion_after_estimate: number;
}

function toOfferable(copies: Awaited<ReturnType<typeof getUserCopies>>): OfferableCopy[] {
  return copies
    .filter((c) => isOfferable(c.availability))
    .map((c) => ({
      collectibleId: c.variant.collectible.id,
      availability: c.availability as "TRADE" | "GIVE_AWAY",
    }));
}

function enrich(offers: MatchOffer[], collectiblesById: Map<string, CatalogCollectible>): PublicMatchOffer[] {
  return offers.map((offer) => {
    const collectible = collectiblesById.get(offer.collectibleId);
    return {
      collectible: {
        id: offer.collectibleId,
        number: collectible?.number ?? "",
        name: collectible?.name ?? "Unknown",
        rarity: collectible?.rarity ?? null,
      },
      availability: offer.availability,
    };
  });
}

/**
 * Computes proposed exchanges between the requesting user and every
 * other collector, scoped to one Set. Only "safe" fields (display name,
 * card identities, availability) ever leave this function — no email,
 * user id, or contact info.
 */
export async function computeMatchesForUser(userId: string, setId: string): Promise<CollectorMatch[]> {
  const set = await catalogProvider.getSet(setId);
  if (!set) throw ApiError.notFound("Set not found");

  const collectibles = await catalogProvider.listCollectibles(setId);
  const collectiblesById = new Map(collectibles.map((c) => [c.id, c]));

  const myCopies = await getUserCopies(userId, setId);
  const myProgress = calculateProgress(
    collectibles.map((c) => ({ id: c.id })),
    myCopies.map((c) => ({ collectibleId: c.variant.collectible.id }))
  );
  const myOfferable = toOfferable(myCopies);

  const otherUsers = await prisma.user.findMany({ where: { id: { not: userId } } });

  const results: CollectorMatch[] = [];

  for (const other of otherUsers) {
    const otherCopies = await getUserCopies(other.id, setId);
    const otherProgress = calculateProgress(
      collectibles.map((c) => ({ id: c.id })),
      otherCopies.map((c) => ({ collectibleId: c.variant.collectible.id }))
    );
    const otherOfferable = toOfferable(otherCopies);

    const match = computeMatch(
      myProgress.missingCollectibleIds,
      otherProgress.missingCollectibleIds,
      myOfferable,
      otherOfferable
    );

    const hasSignal = match.youCanReceive.length > 0 || match.youCanOffer.length > 0;
    if (!hasSignal) continue;

    const completionAfter = estimateCompletionAfter(
      myProgress.totalCount,
      myProgress.ownedCount,
      match.youCanReceive.map((o) => o.collectibleId)
    );

    results.push({
      collector: { display_name: other.displayName },
      is_mutual_match: match.isMutualMatch,
      you_can_receive: enrich(match.youCanReceive, collectiblesById),
      you_can_offer: enrich(match.youCanOffer, collectiblesById),
      donation_opportunities: enrich(match.donationOpportunities, collectiblesById),
      set_completion_before: myProgress.completionPercentage / 100,
      set_completion_after_estimate: completionAfter / 100,
    });
  }

  return results;
}
