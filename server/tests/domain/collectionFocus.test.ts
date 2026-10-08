import { describe, expect, it } from "vitest";
import {
  focusCount,
  focusHref,
  focusLabel,
  isCollectionView,
  setsForFocus,
  type FocusSet,
} from "../../../web/src/lib/collectionFocus.ts";
import {
  explorerLead,
  filtersFromSearchParams,
  searchParamsFromFilters,
  EMPTY_FILTERS,
} from "../../../web/src/lib/explorerQuery.ts";

function set(partial: Partial<FocusSet> & Pick<FocusSet, "id" | "name">): FocusSet {
  return {
    code: partial.id,
    universe_name: "Harbor Atlas",
    missing_count: 0,
    duplicate_count: 0,
    owned_count: 0,
    trade_copies: 0,
    donation_copies: 0,
    sell_copies: 0,
    ...partial,
  };
}

describe("set links", () => {
  it("reads a missing-card link and ignores a bad filter", () => {
    const filters = filtersFromSearchParams(new URLSearchParams("ownership=missing&availability=nope&q=lantern"));
    expect(filters.ownership).toBe("missing");
    expect(filters.availability).toBe("any");
    expect(filters.search).toBe("lantern");
    expect(searchParamsFromFilters(filters).toString()).toBe("q=lantern&ownership=missing");
  });

  it("omits the default filters from the link", () => {
    expect(searchParamsFromFilters(EMPTY_FILTERS).toString()).toBe("");
    expect(explorerLead(EMPTY_FILTERS)).toBeNull();
    expect(explorerLead({ ...EMPTY_FILTERS, ownership: "missing", availability: "trade" })).toBe(
      "Showing cards you don't have and copies for trade.",
    );
  });

  it("keeps rarity, condition, sort, and a detail in the address", () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams("rarity=Rare&rarity=Rare&rarity=Common&condition=Near+Mint&sort=name&m=ink:Sea&m=nope"),
    );
    expect(filters.rarities).toEqual(["Rare", "Common"]);
    expect(filters.condition).toBe("Near Mint");
    expect(filters.sort).toBe("name");
    expect(filters.metadata).toEqual({ ink: ["Sea"] });
    expect(searchParamsFromFilters(filters).toString()).toBe(
      "rarity=Common&rarity=Rare&condition=Near+Mint&sort=name&m=ink%3ASea",
    );
    expect(explorerLead(filters)).toBe("Showing 2 rarities and Near Mint and Sea.");
  });

  it("ignores a bad sort, a bad condition, and a detail with no value", () => {
    const filters = filtersFromSearchParams(new URLSearchParams("sort=price&condition=Gem&m=:Sea&m=ink:"));
    expect(filters.sort).toBe("number");
    expect(filters.condition).toBe("any");
    expect(filters.metadata).toEqual({});
    expect(searchParamsFromFilters(filters).toString()).toBe("");
    expect(explorerLead({ ...EMPTY_FILTERS, condition: "unset" })).toBe("Showing copies with no condition.");
  });
});

describe("collection focus", () => {
  it("rejects an unknown list", () => {
    expect(isCollectionView("missing")).toBe(true);
    expect(isCollectionView("price")).toBe(false);
  });

  it("puts a started set ahead of a larger untouched set", () => {
    const started = set({ id: "ha", name: "Lantern Harbor", owned_count: 10, missing_count: 4 });
    const untouched = set({ id: "sv", name: "Starter Voyage", missing_count: 24 });
    expect(setsForFocus([untouched, started], "missing").map((item) => item.id)).toEqual(["ha", "sv"]);
    expect(focusHref("ha", "missing")).toBe("/sets/ha?ownership=missing");
    expect(focusLabel(focusCount(started, "missing"), "missing")).toBe("4 missing");
    expect(setsForFocus([started, untouched], "trade")).toEqual([]);
  });
});
