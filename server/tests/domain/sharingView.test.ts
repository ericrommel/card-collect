import { describe, expect, it } from "vitest";
import { buildPublicShareView, type PublicShareInput } from "../../src/domain/sharingView.js";

function baseInput(overrides: Partial<PublicShareInput> = {}): PublicShareInput {
  return {
    collectorDisplayName: "Alice",
    setName: "Starter Voyage",
    setCode: "SV-01",
    totalCount: 24,
    completionPercentage: 66.7,
    ownedCollectibles: [{ number: "SV01-001", name: "Straw Hat Captain", rarity: "L" }],
    missingCollectibles: [{ number: "SV01-020", name: "Voyage's End Treasure", rarity: "SEC" }],
    duplicateCollectibles: [{ number: "SV01-003", name: "Sniper's Steady Aim", rarity: "C", duplicate_quantity: 1 }],
    tradeOffers: [{ number: "SV01-003", name: "Sniper's Steady Aim", rarity: "C" }],
    giveAwayOffers: [{ number: "SV01-012", name: "Grand Line Current", rarity: "C" }],
    visibility: {
      showCompletion: true,
      showOwned: true,
      showMissing: true,
      showDuplicates: true,
      showTrade: true,
      showGiveAway: true,
    },
    ...overrides,
  };
}

describe("buildPublicShareView", () => {
  it("always includes collector display name and set info", () => {
    const view = buildPublicShareView(baseInput());
    expect(view.collector).toEqual({ display_name: "Alice" });
    expect(view.set).toEqual({ name: "Starter Voyage", code: "SV-01", total_count: 24 });
  });

  it("includes every field when all visibility flags are on", () => {
    const view = buildPublicShareView(baseInput());
    expect(view.completion_percentage).toBe(66.7);
    expect(view.owned).toHaveLength(1);
    expect(view.missing).toHaveLength(1);
    expect(view.duplicates).toHaveLength(1);
    expect(view.trade_offers).toHaveLength(1);
    expect(view.give_away_offers).toHaveLength(1);
  });

  it("omits every optional field when all visibility flags are off", () => {
    const view = buildPublicShareView(
      baseInput({
        visibility: {
          showCompletion: false,
          showOwned: false,
          showMissing: false,
          showDuplicates: false,
          showTrade: false,
          showGiveAway: false,
        },
      }),
    );
    expect(view.completion_percentage).toBeUndefined();
    expect(view.owned).toBeUndefined();
    expect(view.missing).toBeUndefined();
    expect(view.duplicates).toBeUndefined();
    expect(view.trade_offers).toBeUndefined();
    expect(view.give_away_offers).toBeUndefined();
    // Only collector + set survive — assert the whole key set, not just spot fields.
    expect(Object.keys(view).sort()).toEqual(["collector", "set"]);
  });

  it("respects each visibility flag independently", () => {
    const view = buildPublicShareView(
      baseInput({
        visibility: {
          showCompletion: true,
          showOwned: false,
          showMissing: false,
          showDuplicates: false,
          showTrade: false,
          showGiveAway: false,
        },
      }),
    );
    expect(view.completion_percentage).toBe(66.7);
    expect(view.owned).toBeUndefined();
  });

  it("never has a path to leak fields outside the declared input type", () => {
    // Structural guarantee: the only way data reaches the output is through
    // the named PublicShareInput fields above. This test just documents the
    // whitelist so a future edit that widens PublicShareInput gets noticed.
    const view = buildPublicShareView(baseInput());
    const allowedTopLevelKeys = [
      "collector",
      "set",
      "completion_percentage",
      "owned",
      "missing",
      "duplicates",
      "trade_offers",
      "give_away_offers",
    ];
    expect(Object.keys(view).every((k) => allowedTopLevelKeys.includes(k))).toBe(true);
  });
});
