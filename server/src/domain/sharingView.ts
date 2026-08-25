/**
 * Builds the public, read-only representation of a shared collection.
 *
 * This is a pure function over a narrow, explicit input shape — never a
 * Prisma row. That is deliberate: `PublicShareInput` only has fields that
 * are safe to publish (display name, card identities, counts). Adding a
 * new private column to the User/UserCopy/CollectionShare Prisma models
 * later cannot leak through here, because there is no path from "new
 * Prisma field" to "appears in the response" that skips this type.
 */

export interface ShareVisibility {
  showCompletion: boolean;
  showOwned: boolean;
  showMissing: boolean;
  showDuplicates: boolean;
  showTrade: boolean;
  showGiveAway: boolean;
}

export interface ShareCollectibleRef {
  number: string;
  name: string;
  rarity: string | null;
}

export interface ShareDuplicateRef extends ShareCollectibleRef {
  duplicate_quantity: number;
}

export interface PublicShareInput {
  collectorDisplayName: string;
  setName: string;
  setCode: string;
  totalCount: number;
  completionPercentage: number;
  ownedCollectibles: ShareCollectibleRef[];
  missingCollectibles: ShareCollectibleRef[];
  duplicateCollectibles: ShareDuplicateRef[];
  tradeOffers: ShareCollectibleRef[];
  giveAwayOffers: ShareCollectibleRef[];
  visibility: ShareVisibility;
}

export interface PublicShareView {
  collector: { display_name: string };
  set: { name: string; code: string; total_count: number };
  completion_percentage?: number;
  owned?: ShareCollectibleRef[];
  missing?: ShareCollectibleRef[];
  duplicates?: ShareDuplicateRef[];
  trade_offers?: ShareCollectibleRef[];
  give_away_offers?: ShareCollectibleRef[];
}

export function buildPublicShareView(input: PublicShareInput): PublicShareView {
  const view: PublicShareView = {
    collector: { display_name: input.collectorDisplayName },
    set: { name: input.setName, code: input.setCode, total_count: input.totalCount },
  };

  if (input.visibility.showCompletion) {
    view.completion_percentage = input.completionPercentage;
  }
  if (input.visibility.showOwned) {
    view.owned = input.ownedCollectibles;
  }
  if (input.visibility.showMissing) {
    view.missing = input.missingCollectibles;
  }
  if (input.visibility.showDuplicates) {
    view.duplicates = input.duplicateCollectibles;
  }
  if (input.visibility.showTrade) {
    view.trade_offers = input.tradeOffers;
  }
  if (input.visibility.showGiveAway) {
    view.give_away_offers = input.giveAwayOffers;
  }

  return view;
}
