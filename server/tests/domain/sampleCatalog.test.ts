import { describe, expect, it } from "vitest";
import {
  DEMO_COMPLETED_TRADE,
  HARBOR_UNIVERSE,
  buildHarborSets,
  planDemoCopies,
  sampleNoticeForSlug,
} from "../../src/catalog/sampleCatalog.js";
import { findDonationCandidate, findMutualTradeCandidate } from "../../src/domain/matching.js";
import { calculateProgress } from "../../src/domain/progress.js";
import type { AvailabilityTaggedCopy } from "../../src/domain/matching.js";

function copiesFor(owner: "alice" | "bob" | "carol", setCode: string) {
  return planDemoCopies().filter((copy) => copy.owner === owner && copy.setCode === setCode);
}

function tradeBetween(setCode: string) {
  const cards = buildHarborSets().find((set) => set.code === setCode);
  if (!cards) throw new Error(`missing ${setCode}`);
  const collectibles = cards.cards.map((card) => ({ id: card.number }));
  const alice = copiesFor("alice", setCode);
  const bob = copiesFor("bob", setCode);
  const aliceProgress = calculateProgress(
    collectibles,
    alice.map((copy) => ({ collectibleId: copy.number })),
  );
  const bobProgress = calculateProgress(
    collectibles,
    bob.map((copy) => ({ collectibleId: copy.number })),
  );
  const tag = (copies: typeof alice): AvailabilityTaggedCopy[] =>
    copies.map((copy) => ({ collectibleId: copy.number, availability: copy.availability }));
  return findMutualTradeCandidate(
    aliceProgress.missingCollectibleIds,
    bobProgress.missingCollectibleIds,
    tag(alice),
    tag(bob),
  );
}

describe("Harbor Atlas sample catalog", () => {
  const sets = buildHarborSets();
  const plan = planDemoCopies();

  it("builds three original sets large enough to exercise a real collection", () => {
    expect(HARBOR_UNIVERSE.slug).toBe("harbor-atlas");
    expect(sets.map((set) => [set.code, set.cards.length])).toEqual([
      ["HA-01", 180],
      ["HA-02", 120],
      ["HA-03", 96],
    ]);
    const numbers = sets.flatMap((set) => set.cards.map((card) => card.number));
    const names = sets.flatMap((set) => set.cards.map((card) => card.name));
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((name) => /luffy|pikachu|charizard|one piece/i.test(name))).toBe(false);
  });

  it("labels sample universes and leaves unknown catalogs alone", () => {
    expect(sampleNoticeForSlug("harbor-atlas")).toMatch(/not an official set/i);
    expect(sampleNoticeForSlug("one-piece-card-game")).toMatch(/not official/i);
    expect(sampleNoticeForSlug("someone-elses-game")).toBeNull();
  });

  it("gives Alice and Bob a mutual trade in the two sets they both collect", () => {
    const harbor = tradeBetween("HA-01");
    const market = tradeBetween("HA-02");
    expect(harbor).not.toBeNull();
    expect(market).not.toBeNull();
    expect(harbor!.currentUserReceives.length).toBeGreaterThan(0);
    expect(harbor!.otherCollectorReceives.length).toBeGreaterThan(0);
    expect(market!.currentUserReceives.length).toBeGreaterThan(0);
    expect(market!.otherCollectorReceives.length).toBeGreaterThan(0);
  });

  it("keeps Carol out of matching and leaves Alice an untouched set with donations", () => {
    const carolOffers = plan.filter((copy) => copy.owner === "carol" && copy.availability !== "KEEP");
    expect(carolOffers).toEqual([]);

    const archive = sets.find((set) => set.code === "HA-03")!;
    expect(copiesFor("alice", "HA-03")).toEqual([]);
    const bobDonations = findDonationCandidate(
      archive.cards.map((card) => card.number),
      copiesFor("bob", "HA-03").map((copy) => ({ collectibleId: copy.number, availability: copy.availability })),
    );
    expect(bobDonations.length).toBeGreaterThan(0);
  });

  it("records the completed-trade pair as one Keep copy on the recipient", () => {
    const owned = (owner: "alice" | "bob", number: string) =>
      plan.filter(
        (copy) => copy.owner === owner && copy.setCode === DEMO_COMPLETED_TRADE.setCode && copy.number === number,
      );
    expect(owned("alice", DEMO_COMPLETED_TRADE.aliceReceivedNumber)).toEqual([
      expect.objectContaining({ availability: "KEEP" }),
    ]);
    expect(owned("bob", DEMO_COMPLETED_TRADE.aliceReceivedNumber)).toEqual([]);
    expect(owned("bob", DEMO_COMPLETED_TRADE.bobReceivedNumber)).toEqual([
      expect.objectContaining({ availability: "KEEP" }),
    ]);
    expect(owned("alice", DEMO_COMPLETED_TRADE.bobReceivedNumber)).toEqual([]);
  });

  it("can put two different conditions on two copies of the same card", () => {
    const grouped = new Map<string, Set<string | null>>();
    for (const copy of plan) {
      const key = `${copy.owner}:${copy.number}`;
      const conditions = grouped.get(key) ?? new Set<string | null>();
      conditions.add(copy.condition);
      grouped.set(key, conditions);
    }
    const distinct = [...grouped.values()].some((conditions) => conditions.size > 1);
    expect(distinct).toBe(true);
  });
});
