import { describe, expect, it } from "vitest";
import { searchCatalogCards, type SearchableCard } from "../../src/modules/catalog/searchCatalog.js";

function card(partial: Partial<SearchableCard> & Pick<SearchableCard, "id" | "name" | "number">): SearchableCard {
  return {
    rarity: "Common",
    set: { id: "set-1", name: "Lantern Harbor", code: "HA-01" },
    universeName: "Harbor Atlas",
    ...partial,
  };
}

describe("searchCatalogCards", () => {
  const cards = [
    card({ id: "1", number: "HA01-001", name: "Lantern Keeper" }),
    card({ id: "2", number: "HA01-020", name: "Old Lantern" }),
    card({
      id: "3",
      number: "GM-2",
      name: "Glass Bell",
      set: { id: "set-2", name: "Glass Market", code: "HA-02" },
    }),
  ];

  it("puts an exact name ahead of a name that only contains the word", () => {
    const found = searchCatalogCards(cards, "Lantern Keeper", 24);
    expect(found.results.map((item) => item.id)).toEqual(["1"]);
    expect(found.truncated).toBe(false);
  });

  it("matches a set code and ignores a one-letter query", () => {
    expect(searchCatalogCards(cards, "ha-02", 24).results.map((item) => item.id)).toEqual(["3"]);
    expect(searchCatalogCards(cards, "l", 24)).toEqual({ results: [], truncated: false });
  });

  it("keeps only the closest rows when the query is broad", () => {
    const found = searchCatalogCards(cards, "lantern", 1);
    expect(found.truncated).toBe(true);
    expect(found.results).toHaveLength(1);
    expect(found.results[0]?.name.startsWith("Lantern")).toBe(true);
  });
});
