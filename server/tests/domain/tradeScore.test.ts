import { describe, expect, it } from "vitest";
import {
  compareMatches,
  scoreDonation,
  scoreMutualTrade,
  type CollectibleRef,
  type ScoredMatch,
} from "../../src/domain/tradeScore.js";

// totalCount = 100 keeps "cards received" and "completion gain percentage
// points" numerically identical, which makes the test data easy to reason
// about by hand without losing generality (the formula only ever sees the
// resulting percentages, never raw counts).
/** Spare copies stay after a trade. Pass the ids this person would give away. */
const snapshot = (ownedCount: number, spareIds: readonly string[] = []) => ({
  totalCount: 100,
  ownedCount,
  quantityByCollectible: new Map(spareIds.map((id) => [id, 2])),
});

const noRefs = new Map<string, CollectibleRef>();

function idsOfLength(n: number, prefix = "c"): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

describe("scoreMutualTrade / scoreDonation — score properties", () => {
  it("1. a mutual trade that gives more missing cards ranks above one that gives fewer", () => {
    const bigger = scoreMutualTrade(
      snapshot(50, idsOfLength(20, "o")),
      snapshot(50, idsOfLength(20)),
      { currentUserReceives: idsOfLength(20), otherCollectorReceives: idsOfLength(20, "o") },
      noRefs,
    );
    const smaller = scoreMutualTrade(
      snapshot(50, idsOfLength(5, "o")),
      snapshot(50, idsOfLength(5)),
      { currentUserReceives: idsOfLength(5), otherCollectorReceives: idsOfLength(5, "o") },
      noRefs,
    );
    expect(bigger.score).toBeGreaterThan(smaller.score);
  });

  it("2. a balanced mutual trade beats an otherwise similar severely unbalanced trade", () => {
    // Same average benefit (6 cards) on both, but one is 6/6 and the other is 11/1.
    const balanced = scoreMutualTrade(
      snapshot(50, idsOfLength(6, "o")),
      snapshot(50, idsOfLength(6)),
      { currentUserReceives: idsOfLength(6), otherCollectorReceives: idsOfLength(6, "o") },
      noRefs,
    );
    const unbalanced = scoreMutualTrade(
      snapshot(50, idsOfLength(1, "o")),
      snapshot(50, idsOfLength(11)),
      { currentUserReceives: idsOfLength(11), otherCollectorReceives: idsOfLength(1, "o") },
      noRefs,
    );
    expect(balanced.score).toBeGreaterThan(unbalanced.score);
  });

  it("3. a larger completion gain increases the score (donation, strictly monotonic)", () => {
    const small = scoreDonation(snapshot(50), idsOfLength(3), noRefs);
    const large = scoreDonation(snapshot(50), idsOfLength(15), noRefs);
    expect(large.score).toBeGreaterThan(small.score);
  });

  it("4. a mutual exchange generally ranks above an equivalent one-way donation", () => {
    const donation = scoreDonation(snapshot(50), idsOfLength(10), noRefs);
    const balancedTrade = scoreMutualTrade(
      snapshot(50, idsOfLength(10, "o")),
      snapshot(50, idsOfLength(10)),
      { currentUserReceives: idsOfLength(10), otherCollectorReceives: idsOfLength(10, "o") },
      noRefs,
    );
    expect(balancedTrade.score).toBeGreaterThan(donation.score);
  });

  it("9. score calculation is deterministic for identical inputs", () => {
    const input = { currentUserReceives: idsOfLength(7), otherCollectorReceives: idsOfLength(4, "o") };
    const first = scoreMutualTrade(snapshot(40, idsOfLength(4, "o")), snapshot(60, idsOfLength(7)), input, noRefs);
    const second = scoreMutualTrade(
      snapshot(40, idsOfLength(4, "o")),
      snapshot(60, idsOfLength(7)),
      { ...input },
      noRefs,
    );
    expect(second).toEqual(first);
  });

  it("11. never mutates the snapshots or candidate ids it was given", () => {
    const current = Object.freeze(snapshot(50, idsOfLength(2, "o")));
    const other = Object.freeze(snapshot(50, idsOfLength(3)));
    const candidate = Object.freeze({
      currentUserReceives: Object.freeze(idsOfLength(3)) as string[],
      otherCollectorReceives: Object.freeze(idsOfLength(2, "o")) as string[],
    });

    expect(() => scoreMutualTrade(current, other, candidate, noRefs)).not.toThrow();
    expect(current).toEqual(snapshot(50, idsOfLength(2, "o")));
    expect(other).toEqual(snapshot(50, idsOfLength(3)));

    const donationIds = Object.freeze(idsOfLength(3)) as string[];
    expect(() => scoreDonation(Object.freeze(snapshot(50)), donationIds, noRefs)).not.toThrow();
  });
});

describe("net completion", () => {
  it("keeps a spare and drops a card when the only copy leaves", () => {
    const kept = scoreMutualTrade(
      snapshot(50, ["o0"]),
      snapshot(50, ["c0"]),
      { currentUserReceives: ["c0"], otherCollectorReceives: ["o0"] },
      noRefs,
    );
    const lastCopy = scoreMutualTrade(
      { totalCount: 100, ownedCount: 50, quantityByCollectible: new Map([["o0", 1]]) },
      { totalCount: 100, ownedCount: 50, quantityByCollectible: new Map([["c0", 1]]) },
      { currentUserReceives: ["c0"], otherCollectorReceives: ["o0"] },
      noRefs,
    );

    expect(kept.currentUser).toMatchObject({ completionBefore: 50, completionAfter: 51, completionGain: 1 });
    expect(lastCopy.currentUser).toMatchObject({ completionBefore: 50, completionAfter: 50, completionGain: 0 });
    expect(lastCopy.otherCollector).toMatchObject({ completionBefore: 50, completionAfter: 50, completionGain: 0 });
    expect(kept.score).toBeGreaterThan(lastCopy.score);
  });
});

describe("compareMatches — deterministic ranking", () => {
  function match(overrides: Partial<ScoredMatch> & { score: number; collectorDisplayName: string }): ScoredMatch {
    return {
      type: "MUTUAL_TRADE",
      currentUser: { cardsReceived: 0, completionBefore: 0, completionAfter: 0, completionGain: 0 },
      proposedExchange: { currentUserReceives: [], otherCollectorReceives: [] },
      ...overrides,
    };
  }

  it("10. breaks ties by score, then current-user gain, then other-collector gain, then display name", () => {
    const a = match({
      score: 50,
      collectorDisplayName: "Zed",
      currentUser: { cardsReceived: 5, completionBefore: 0, completionAfter: 5, completionGain: 5 },
    });
    const b = match({
      score: 50,
      collectorDisplayName: "Amy",
      currentUser: { cardsReceived: 5, completionBefore: 0, completionAfter: 5, completionGain: 5 },
    });
    const c = match({
      score: 50,
      collectorDisplayName: "Mid",
      currentUser: { cardsReceived: 8, completionBefore: 0, completionAfter: 8, completionGain: 8 },
    });

    const sorted = [a, b, c].sort(compareMatches);

    // c wins on completionGain (8 > 5); a vs b tie on score+gain, so
    // "Amy" sorts before "Zed" alphabetically.
    expect(sorted.map((m) => m.collectorDisplayName)).toEqual(["Mid", "Amy", "Zed"]);
  });

  it("sorting the same inputs twice always produces the same order", () => {
    const items = [
      match({ score: 30, collectorDisplayName: "Charlie" }),
      match({ score: 90, collectorDisplayName: "Bravo" }),
      match({ score: 30, collectorDisplayName: "Alpha" }),
    ];
    const first = [...items].sort(compareMatches).map((m) => m.collectorDisplayName);
    const second = [...items].sort(compareMatches).map((m) => m.collectorDisplayName);
    expect(second).toEqual(first);
    expect(first).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("breaks a remaining display-name tie by collector ref, not by input order", () => {
    const later = match({ score: 10, collectorDisplayName: "Sam", collectorRef: "b" });
    const earlier = match({ score: 10, collectorDisplayName: "Sam", collectorRef: "a" });
    expect([later, earlier].sort(compareMatches).map((m) => m.collectorRef)).toEqual(["a", "b"]);
  });
});
