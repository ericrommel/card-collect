import { describe, expect, it } from "vitest";
import { calculateProgress, estimateCompletionAfter } from "../../src/domain/progress.js";

function collectibles(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `c${i + 1}` }));
}

describe("calculateProgress", () => {
  it("computes completion percentage and missing count for distinct ownership", () => {
    const setCollectibles = collectibles(10);
    // owns 6 distinct collectibles, one copy each
    const userCopies = ["c1", "c2", "c3", "c4", "c5", "c6"].map((collectibleId) => ({ collectibleId }));

    const result = calculateProgress(setCollectibles, userCopies);

    expect(result.completionPercentage).toBe(60);
    expect(result.missingCount).toBe(4);
    expect(result.ownedCount).toBe(6);
    expect(result.missingCollectibleIds).toEqual(["c7", "c8", "c9", "c10"]);
  });

  it("does not let multiple copies of one collectible inflate completion", () => {
    const setCollectibles = collectibles(10);
    const userCopies = [
      { collectibleId: "c1" },
      { collectibleId: "c1" },
      { collectibleId: "c1" },
      { collectibleId: "c2" },
    ];

    const result = calculateProgress(setCollectibles, userCopies);

    expect(result.ownedCount).toBe(2); // c1 and c2 only, despite 4 physical copies
    expect(result.completionPercentage).toBe(20);
  });

  it("reports duplicate quantity per collectible", () => {
    const setCollectibles = collectibles(1);
    const userCopies = [{ collectibleId: "c1" }, { collectibleId: "c1" }, { collectibleId: "c1" }];

    const result = calculateProgress(setCollectibles, userCopies);

    const entry = result.entries.find((e) => e.collectibleId === "c1");
    expect(entry?.ownedQuantity).toBe(3);
    expect(entry?.duplicateQuantity).toBe(2);
    expect(result.duplicateCount).toBe(2);
  });

  it("handles owning nothing", () => {
    const result = calculateProgress(collectibles(5), []);
    expect(result.ownedCount).toBe(0);
    expect(result.missingCount).toBe(5);
    expect(result.completionPercentage).toBe(0);
  });
});

describe("estimateCompletionAfter", () => {
  it("adds newly received collectibles up to the set total", () => {
    expect(estimateCompletionAfter(10, 6, ["a", "b"])).toBe(80);
    expect(estimateCompletionAfter(10, 9, ["a", "b", "c"])).toBe(100); // capped at total
  });

  it("never mutates the collectible id list it was given", () => {
    const ids = Object.freeze(["a", "b"]);
    expect(() => estimateCompletionAfter(10, 6, ids as unknown as string[])).not.toThrow();
    expect(ids).toEqual(["a", "b"]);
  });
});
