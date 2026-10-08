/** A catalog row the in-process search can rank. A provider can supply these from any source. */
export interface SearchableCard {
  id: string;
  number: string;
  name: string;
  rarity: string | null;
  set: { id: string; name: string; code: string };
  universeName: string;
}

const MIN_QUERY = 2;

/**
 * Ranks cards by how directly the text matches the name, number, or set.
 * Short queries match too much of a catalog, so they return nothing.
 * The caller decides how many rows to keep.
 */
export function searchCatalogCards<T extends SearchableCard>(
  cards: T[],
  rawQuery: string,
  limit: number,
): { results: T[]; truncated: boolean } {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < MIN_QUERY || limit < 1) return { results: [], truncated: false };

  const ranked = cards.map((card) => ({ card, rank: matchRank(card, query) })).filter((item) => item.rank < 4);
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.card.set.code.localeCompare(b.card.set.code) ||
      a.card.number.localeCompare(b.card.number, undefined, { numeric: true }),
  );
  return {
    results: ranked.slice(0, limit).map((item) => item.card),
    truncated: ranked.length > limit,
  };
}

function matchRank(card: SearchableCard, query: string): number {
  const number = card.number.toLowerCase();
  const name = card.name.toLowerCase();
  const code = card.set.code.toLowerCase();
  const setName = card.set.name.toLowerCase();
  if (number === query || name === query || code === query) return 0;
  if (number.startsWith(query) || name.startsWith(query) || code.startsWith(query)) return 1;
  if (number.includes(query) || name.includes(query)) return 2;
  if (code.includes(query) || setName.includes(query)) return 3;
  return 4;
}
