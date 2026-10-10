import { describe, expect, it } from "vitest";
import { writtenCountSentence } from "../../../web/src/lib/writtenCount.ts";

describe("writtenCountSentence", () => {
  it("counts notes and extra copies without a percent", () => {
    expect(writtenCountSentence(1, 0)).toBe("1 note. No extra copies.");
    expect(writtenCountSentence(2, 1)).toBe("2 notes. 1 extra copy.");
    expect(writtenCountSentence(4, 3)).toBe("4 notes. 3 extra copies.");
    for (const sentence of [writtenCountSentence(1, 0), writtenCountSentence(8, 5)]) {
      expect(sentence).not.toContain("%");
    }
  });
});
