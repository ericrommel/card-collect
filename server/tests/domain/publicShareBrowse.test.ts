import { describe, expect, it } from "vitest";
import {
  defaultPublicSection,
  publicCardsMatching,
  publicSections,
  type PublicCardRef,
} from "../../../web/src/lib/publicShareBrowse.ts";

const trade = [{ name: "Cedar Keeper", number: "HA01-002", rarity: "C" }];
const donations = [{ name: "Ferry Keeper", number: "HA01-005", rarity: "R" }];
const missing = [{ name: "Lantern Keeper", number: "HA01-001", rarity: "L" }];
const owned = [
  { name: "Cedar Keeper", number: "HA01-002", rarity: "C" },
  { name: "Orchard Keeper", number: "HA01-006", rarity: "SEC" },
];

describe("publicSections", () => {
  it("puts offers before the owned catalog and skips a list the owner hid", () => {
    const sections = publicSections({
      owned,
      missing,
      trade_offers: trade,
    });
    expect(sections.map((section) => section.id)).toEqual(["trade", "missing", "owned"]);
    expect(sections.map((section) => section.title)).toEqual(["For trade", "Missing", "Owned"]);
    expect(publicSections({ duplicates: owned }).map((section) => section.title)).toEqual(["Extras"]);
    expect(sections[2]?.items).toBe(owned);
  });

  it("keeps an empty list the owner chose to share", () => {
    const sections = publicSections({ trade_offers: [], give_away_offers: donations });
    expect(sections.map((section) => section.id)).toEqual(["trade", "give_away"]);
    expect(sections[0]?.items).toEqual([]);
  });
});

describe("defaultPublicSection", () => {
  it("opens the first list that has cards", () => {
    const sections = publicSections({
      trade_offers: [],
      give_away_offers: donations,
      owned,
    });
    expect(defaultPublicSection(sections)).toBe("give_away");
  });

  it("stays on the first list when every shared list is empty", () => {
    const sections = publicSections({ trade_offers: [], missing: [] });
    expect(defaultPublicSection(sections)).toBe("trade");
  });

  it("returns null when nothing was shared", () => {
    expect(defaultPublicSection([])).toBeNull();
  });
});

describe("publicCardsMatching", () => {
  const cards: PublicCardRef[] = [...missing, ...donations, ...owned];

  it("matches a name, a number, or a rarity label without changing the list for a blank query", () => {
    expect(publicCardsMatching(cards, "   ")).toBe(cards);
    expect(publicCardsMatching(cards, "lantern").map((card) => card.number)).toEqual(["HA01-001"]);
    expect(publicCardsMatching(cards, "ha01-006").map((card) => card.number)).toEqual(["HA01-006"]);
    expect(publicCardsMatching(cards, "rare").map((card) => card.number)).toEqual(["HA01-005"]);
    expect(publicCardsMatching(cards, "secret").map((card) => card.number)).toEqual(["HA01-006"]);
    expect(publicCardsMatching(cards, "leader").map((card) => card.number)).toEqual(["HA01-001"]);
    const withKind: PublicCardRef[] = [{ name: "Lantern Keeper", number: "HA01-001", rarity: "C", kind: "Place" }];
    expect(publicCardsMatching(withKind, "place").map((card) => card.number)).toEqual(["HA01-001"]);
    expect(publicCardsMatching(cards, "place")).toEqual([]);
  });

  it("returns no cards when nothing matches", () => {
    expect(publicCardsMatching(cards, "glass market")).toEqual([]);
  });
});
