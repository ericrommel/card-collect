import { describe, expect, it } from "vitest";
import { computeMatch, estimateCompletionAfter } from "../../src/domain/matching.js";
import { isOfferable } from "../../src/modules/collection/service.js";

describe("computeMatch", () => {
  it("finds a mutual match when A needs X/offers Y and B needs Y/offers X", () => {
    const aMissing = ["X"];
    const bMissing = ["Y"];
    const aOffers = [{ collectibleId: "Y", availability: "TRADE" as const }];
    const bOffers = [{ collectibleId: "X", availability: "TRADE" as const }];

    const result = computeMatch(aMissing, bMissing, aOffers, bOffers);

    expect(result.isMutualMatch).toBe(true);
    expect(result.youCanReceive.map((o) => o.collectibleId)).toContain("X");
    expect(result.youCanOffer.map((o) => o.collectibleId)).toContain("Y");
  });

  it("does not report a match when offers are not complementary", () => {
    const aMissing = ["X"];
    const bMissing = ["Y"];
    const aOffers = [{ collectibleId: "Z", availability: "TRADE" as const }]; // A can't help B
    const bOffers = [{ collectibleId: "W", availability: "TRADE" as const }]; // B can't help A

    const result = computeMatch(aMissing, bMissing, aOffers, bOffers);

    expect(result.isMutualMatch).toBe(false);
    expect(result.youCanReceive).toHaveLength(0);
    expect(result.youCanOffer).toHaveLength(0);
  });

  it("surfaces a donation opportunity even when the receiver has nothing to offer back", () => {
    const aMissing = ["X"];
    const bMissing = ["Y"]; // A owns nothing B needs
    const aOffers: never[] = [];
    const bOffers = [{ collectibleId: "X", availability: "GIVE_AWAY" as const }];

    const result = computeMatch(aMissing, bMissing, aOffers, bOffers);

    expect(result.isMutualMatch).toBe(false); // no reciprocal trade
    expect(result.donationOpportunities.map((o) => o.collectibleId)).toEqual(["X"]);
    expect(result.youCanReceive.map((o) => o.collectibleId)).toEqual(["X"]);
  });

  it("deduplicates repeated offers of the same collectible", () => {
    const result = computeMatch(
      ["X"],
      [],
      [],
      [
        { collectibleId: "X", availability: "TRADE" },
        { collectibleId: "X", availability: "TRADE" },
      ]
    );
    expect(result.youCanReceive).toHaveLength(1);
  });
});

describe("estimateCompletionAfter", () => {
  it("adds newly received collectibles up to the set total", () => {
    expect(estimateCompletionAfter(10, 6, ["a", "b"])).toBe(80);
    expect(estimateCompletionAfter(10, 9, ["a", "b", "c"])).toBe(100); // capped at total
  });
});

describe("isOfferable", () => {
  it("never offers KEEP copies", () => {
    expect(isOfferable("KEEP")).toBe(false);
  });

  it("offers TRADE and GIVE_AWAY copies", () => {
    expect(isOfferable("TRADE")).toBe(true);
    expect(isOfferable("GIVE_AWAY")).toBe(true);
  });

  it("does not offer SELL copies (no marketplace in V0)", () => {
    expect(isOfferable("SELL")).toBe(false);
  });
});
