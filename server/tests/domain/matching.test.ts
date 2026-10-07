import { describe, expect, it } from "vitest";
import {
  findDonationCandidate,
  findMutualTradeCandidate,
  type AvailabilityTaggedCopy,
} from "../../src/domain/matching.js";
import { isOfferable } from "../../src/modules/collection/service.js";

function copy(collectibleId: string, availability: AvailabilityTaggedCopy["availability"]): AvailabilityTaggedCopy {
  return { collectibleId, availability };
}

describe("findMutualTradeCandidate", () => {
  it("finds a candidate when A needs X/offers Y and B needs Y/offers X (both via TRADE)", () => {
    const candidate = findMutualTradeCandidate(["X"], ["Y"], [copy("Y", "TRADE")], [copy("X", "TRADE")]);

    expect(candidate).not.toBeNull();
    expect(candidate!.currentUserReceives).toContain("X");
    expect(candidate!.otherCollectorReceives).toContain("Y");
  });

  it("returns null when offers are not complementary", () => {
    const candidate = findMutualTradeCandidate(["X"], ["Y"], [copy("Z", "TRADE")], [copy("W", "TRADE")]);
    expect(candidate).toBeNull();
  });

  it("returns null (never a fabricated one-way trade) when only one side can help", () => {
    // B offers X (which A needs) but A offers nothing B needs.
    const candidate = findMutualTradeCandidate(["X"], ["Y"], [], [copy("X", "TRADE")]);
    expect(candidate).toBeNull();
  });

  it("never uses KEEP copies as trade leverage", () => {
    const candidate = findMutualTradeCandidate(["X"], ["Y"], [copy("Y", "TRADE")], [copy("X", "KEEP")]);
    expect(candidate).toBeNull(); // X is only KEEP on B's side, not TRADE
  });

  it("never uses SELL copies as trade leverage", () => {
    const candidate = findMutualTradeCandidate(["X"], ["Y"], [copy("Y", "TRADE")], [copy("X", "SELL")]);
    expect(candidate).toBeNull();
  });

  it("never uses GIVE_AWAY copies as trade leverage — TRADE and GIVE_AWAY are independent pools", () => {
    // B has X marked GIVE_AWAY (not TRADE) — must not count toward a mutual trade.
    const candidate = findMutualTradeCandidate(["X"], ["Y"], [copy("Y", "TRADE")], [copy("X", "GIVE_AWAY")]);
    expect(candidate).toBeNull();
  });

  it("does not over-allocate when multiple copies of the same collectible exist", () => {
    // B owns 2 TRADE copies of X, plus a KEEP copy — X must still appear only once.
    const candidate = findMutualTradeCandidate(
      ["X"],
      ["Y"],
      [copy("Y", "TRADE")],
      [copy("X", "TRADE"), copy("X", "TRADE"), copy("X", "KEEP")],
    );
    expect(candidate!.currentUserReceives).toEqual(["X"]);
  });
});

describe("findDonationCandidate", () => {
  it("surfaces a donation even when the receiver has nothing to offer back", () => {
    const ids = findDonationCandidate(["X"], [copy("X", "GIVE_AWAY")]);
    expect(ids).toEqual(["X"]);
  });

  it("returns [] when nothing GIVE_AWAY matches what's missing", () => {
    expect(findDonationCandidate(["X"], [copy("Y", "GIVE_AWAY")])).toEqual([]);
  });

  it("never treats a KEEP copy as a donation", () => {
    expect(findDonationCandidate(["X"], [copy("X", "KEEP")])).toEqual([]);
  });

  it("never treats a SELL copy as a donation", () => {
    expect(findDonationCandidate(["X"], [copy("X", "SELL")])).toEqual([]);
  });

  it("never treats a TRADE copy as a donation — TRADE and GIVE_AWAY are independent pools", () => {
    expect(findDonationCandidate(["X"], [copy("X", "TRADE")])).toEqual([]);
  });

  it("deduplicates repeated GIVE_AWAY copies of the same collectible", () => {
    const ids = findDonationCandidate(["X"], [copy("X", "GIVE_AWAY"), copy("X", "GIVE_AWAY")]);
    expect(ids).toEqual(["X"]);
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
