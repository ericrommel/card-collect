import { describe, expect, it } from "vitest";
import { pickHighlights, previewCollectible, toHighlight } from "../../src/modules/dashboard/service.js";
import type { PublicMatch } from "../../src/modules/matching/service.js";

function match(overrides: Partial<PublicMatch> & Pick<PublicMatch, "type" | "score">): PublicMatch {
  return {
    collector: { display_name: "Bob", ref: "ref-bob" },
    current_user: { cards_received: 1, completion_before: 10, completion_after: 20, completion_gain: 10 },
    proposed_exchange: {
      you_receive: [{ id: "c1", number: "HA01-001", name: "Lantern Keeper", rarity: "Common" }],
      they_receive: [],
    },
    ...overrides,
  };
}

describe("dashboard highlights", () => {
  it("keeps trades and donations separate and ranks each by score", () => {
    const harbor = { id: "set-h", name: "Lantern Harbor", code: "HA-01" };
    const market = { id: "set-m", name: "Glass Market", code: "HA-02" };
    const highlights = pickHighlights([
      {
        set: harbor,
        matches: [
          match({ type: "DONATION", score: 12, collector: { display_name: "Bob", ref: "b" } }),
          match({
            type: "MUTUAL_TRADE",
            score: 40,
            collector: { display_name: "Bob", ref: "b" },
            other_collector: { cards_received: 2, completion_before: 30, completion_after: 40, completion_gain: 10 },
            proposed_exchange: {
              you_receive: [
                { id: "c1", number: "HA01-001", name: "One", rarity: "Common" },
                { id: "c2", number: "HA01-002", name: "Two", rarity: "Common" },
                { id: "c3", number: "HA01-003", name: "Three", rarity: "Rare" },
                { id: "c4", number: "HA01-004", name: "Four", rarity: "Rare" },
              ],
              they_receive: [{ id: "c9", number: "HA01-009", name: "Nine", rarity: "Common" }],
            },
          }),
        ],
      },
      {
        set: market,
        matches: [match({ type: "MUTUAL_TRADE", score: 55, collector: { display_name: "Cara", ref: "c" } })],
      },
    ]);

    expect(highlights.trades.map((trade) => [trade.set.code, trade.score])).toEqual([
      ["HA-02", 55],
      ["HA-01", 40],
    ]);
    expect(highlights.donations).toHaveLength(1);
    expect(highlights.donations[0].type).toBe("DONATION");
    expect(highlights.donations[0].their_completion_before).toBeUndefined();
    expect(highlights.trades[1].you_receive_count).toBe(4);
    expect(highlights.trades[1].you_receive_preview).toHaveLength(3);
    expect(highlights.trades[1].you_give_count).toBe(1);
    expect(highlights.trades[1].their_completion_after).toBe(40);
  });

  it("does not invent a reciprocal side for a donation highlight", () => {
    const highlight = toHighlight(
      { id: "set", name: "North Archive", code: "HA-03" },
      match({ type: "DONATION", score: 8 }),
    );
    expect(highlight.you_give_count).toBe(0);
    expect(highlight.you_give_preview).toEqual([]);
    expect(highlight.their_completion_before).toBeUndefined();
  });
});

describe("set cover preview", () => {
  const cards = [
    { id: "a", number: "B-002" },
    { id: "b", number: "B-001" },
    { id: "c", number: "B-010" },
  ];

  it("uses the lowest number you own", () => {
    expect(previewCollectible(cards, new Set(["a", "c"]))?.number).toBe("B-002");
  });

  it("uses the first card when you own none", () => {
    expect(previewCollectible(cards, new Set())?.number).toBe("B-001");
  });

  it("returns null for an empty set", () => {
    expect(previewCollectible([], new Set(["a"]))).toBeNull();
  });
});
