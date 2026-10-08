export const COLLECTION_VIEWS = ["missing", "duplicates", "owned", "trade", "donations", "sale"] as const;

export type CollectionView = (typeof COLLECTION_VIEWS)[number];

export interface FocusSet {
  id: string;
  name: string;
  code: string;
  universe_name: string;
  missing_count: number;
  duplicate_count: number;
  owned_count: number;
  trade_copies: number;
  donation_copies: number;
  sell_copies: number;
}

export function isCollectionView(value: string | undefined): value is CollectionView {
  return COLLECTION_VIEWS.some((view) => view === value);
}

export function focusCount(set: FocusSet, view: CollectionView): number {
  switch (view) {
    case "missing":
      return set.missing_count;
    case "duplicates":
      return set.duplicate_count;
    case "owned":
      return set.owned_count;
    case "trade":
      return set.trade_copies;
    case "donations":
      return set.donation_copies;
    case "sale":
      return set.sell_copies;
  }
}

export function focusHref(setId: string, view: CollectionView): string {
  switch (view) {
    case "missing":
      return `/sets/${setId}?ownership=missing`;
    case "duplicates":
      return `/sets/${setId}?ownership=duplicates`;
    case "owned":
      return `/sets/${setId}?ownership=owned`;
    case "trade":
      return `/sets/${setId}?availability=trade`;
    case "donations":
      return `/sets/${setId}?availability=donation`;
    case "sale":
      return `/sets/${setId}?availability=sell`;
  }
}

export function focusLabel(count: number, view: CollectionView): string {
  switch (view) {
    case "missing":
      return `${count} missing`;
    case "duplicates":
      return count === 1 ? "1 extra" : `${count} extras`;
    case "owned":
      return `${count} owned`;
    case "trade":
      return count === 1 ? "1 for trade" : `${count} for trade`;
    case "donations":
      return count === 1 ? "1 to give away" : `${count} to give away`;
    case "sale":
      return count === 1 ? "1 for sale" : `${count} for sale`;
  }
}

/** Started sets come first, then the largest gap, so an untouched catalog does not bury a set in progress. */
export function setsForFocus<T extends FocusSet>(sets: T[], view: CollectionView): T[] {
  return sets
    .filter((set) => focusCount(set, view) > 0)
    .sort((a, b) => {
      if (view !== "owned") {
        const started = Number(b.owned_count > 0) - Number(a.owned_count > 0);
        if (started !== 0) return started;
      }
      return focusCount(b, view) - focusCount(a, view) || a.name.localeCompare(b.name);
    });
}

export const FOCUS_COPY: Record<CollectionView, { title: string; intro: string; empty: string }> = {
  missing: {
    title: "Missing cards",
    intro:
      "Sets you have started come first. Open one to see the cards you don't have, and select several to mark them owned.",
    empty: "Nothing is missing. Every catalogued card has a copy.",
  },
  duplicates: {
    title: "Extra copies",
    intro: "These sets have more than one copy of a card. Open one to keep a copy and offer the rest.",
    empty: "No extras yet. A card shows up here when you have two copies of it.",
  },
  owned: {
    title: "Cards you have",
    intro: "Open a set to see the cards you have marked.",
    empty: "You have not marked any cards yet. Open a set and select the ones you own.",
  },
  trade: {
    title: "For trade",
    intro: "Copies you already marked for trade. A trade is an exchange, not a sale.",
    empty: "Nothing is for trade. In a set, select cards with extras and choose Offer duplicates.",
  },
  donations: {
    title: "To give away",
    intro: "Copies you would give away. A donation is not a trade, and nothing is asked in return.",
    empty: "Nothing is marked to give away.",
  },
  sale: {
    title: "For sale",
    intro: "Copies you marked for sale. This app does not take payment or arrange the handover.",
    empty: "Nothing is marked for sale.",
  },
};
