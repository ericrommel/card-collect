import { describe, expect, it } from "vitest";
import { highlightAction, previewCountSentence } from "../../../web/src/lib/highlightAction.ts";

const full = {
  type: "MUTUAL_TRADE",
  you_receive_count: 2,
  you_give_count: 1,
  you_receive_preview: [{}, {}],
  you_give_preview: [{}],
};

describe("highlightAction", () => {
  it("opens an exchange that already exists", () => {
    expect(highlightAction({ ...full, open_exchange_id: "open-1", you_receive_preview: [] })).toBe("view");
  });

  it("sends a shortened preview to the match page", () => {
    expect(highlightAction({ ...full, you_receive_preview: [{}] })).toBe("review");
    expect(highlightAction({ ...full, you_give_count: 4, you_give_preview: [{}, {}, {}] })).toBe("review");
  });

  it("can propose only when every card is shown", () => {
    expect(highlightAction(full)).toBe("propose");
    expect(highlightAction({ ...full, type: "DONATION", you_give_count: 0, you_give_preview: [] })).toBe("ask");
  });
});

describe("previewCountSentence", () => {
  it("names a hidden card instead of a bare count", () => {
    expect(previewCountSentence("You receive", 1, 1)).toBe("You receive 1 card.");
    expect(previewCountSentence("You receive", 4, 3)).toBe("You receive 4 cards. 3 shown here.");
    expect(previewCountSentence("You give", 0, 0)).toBe("You give 0 cards.");
  });
});
