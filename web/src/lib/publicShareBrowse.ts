import { rarityLabel } from "./labels";

/** Order a public page offers first. The long owned catalog stays last. */
export const PUBLIC_SECTION_ORDER = ["trade", "give_away", "missing", "duplicates", "owned"] as const;

export type PublicSectionId = (typeof PUBLIC_SECTION_ORDER)[number];

export interface PublicCardRef {
  name: string;
  number: string;
  rarity?: string | null;
  kind?: string | null;
}

export interface PublicSectionSource<T> {
  trade_offers?: T[];
  give_away_offers?: T[];
  missing?: T[];
  duplicates?: T[];
  owned?: T[];
}

export interface PublicSection<T> {
  id: PublicSectionId;
  title: string;
  items: T[];
}

const SECTION_TITLE: Record<PublicSectionId, string> = {
  trade: "For trade",
  give_away: "Donations",
  missing: "Missing",
  duplicates: "Extras",
  owned: "Owned",
};

const SECTION_KEY: Record<PublicSectionId, keyof PublicSectionSource<unknown>> = {
  trade: "trade_offers",
  give_away: "give_away_offers",
  missing: "missing",
  duplicates: "duplicates",
  owned: "owned",
};

/** Sections the owner included. An empty list stays; a hidden list is omitted. */
export function publicSections<T>(view: PublicSectionSource<T>): PublicSection<T>[] {
  const sections: PublicSection<T>[] = [];
  for (const id of PUBLIC_SECTION_ORDER) {
    const items = view[SECTION_KEY[id]] as T[] | undefined;
    if (items === undefined) continue;
    sections.push({ id, title: SECTION_TITLE[id], items });
  }
  return sections;
}

/** First shared list that has cards. An all-empty page stays on the first list. */
export function defaultPublicSection<T>(sections: PublicSection<T>[]): PublicSectionId | null {
  const filled = sections.find((section) => section.items.length > 0);
  return (filled ?? sections[0])?.id ?? null;
}

/** Name, number, kind, stored rarity, or the readable rarity label. A blank query keeps every card. */
export function publicCardsMatching<T extends PublicCardRef>(items: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((card) => {
    const label = rarityLabel(card.rarity) ?? "";
    return `${card.name} ${card.number} ${card.rarity ?? ""} ${label} ${card.kind ?? ""}`
      .toLowerCase()
      .includes(needle);
  });
}
