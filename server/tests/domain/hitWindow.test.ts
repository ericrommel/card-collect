import { describe, expect, it } from "vitest";
import { createHitWindow } from "../../src/lib/hitWindow.js";

describe("hit window", () => {
  it("allows up to the limit inside the window and records only allowed hits", () => {
    const window = createHitWindow(1_000);
    expect(window.tooMany("a", 2, 0)).toBe(false);
    expect(window.tooMany("a", 2, 10)).toBe(false);
    expect(window.tooMany("a", 2, 20)).toBe(true);
    expect(window.tooMany("b", 2, 20)).toBe(false);
  });

  it("forgets hits that have left the window", () => {
    const window = createHitWindow(1_000);
    expect(window.tooMany("a", 1, 0)).toBe(false);
    expect(window.tooMany("a", 1, 999)).toBe(true);
    expect(window.tooMany("a", 1, 1_001)).toBe(false);
  });
});
