import { describe, expect, it } from "vitest";
import { liftShift } from "../../../web/src/lib/liftAboveBar.ts";

describe("liftShift", () => {
  it("stays put when the card already clears the bar", () => {
    expect(liftShift({ top: 200, bottom: 480 }, 520, 120)).toBe(0);
  });

  it("moves only as far as the overlap", () => {
    expect(liftShift({ top: 300, bottom: 560 }, 520, 120)).toBe(48);
  });

  it("stops at the tools when the card is taller than the gap", () => {
    expect(liftShift({ top: 140, bottom: 700 }, 400, 120)).toBe(20);
  });

  it("does not scroll a card that is already against the tools", () => {
    expect(liftShift({ top: 120, bottom: 700 }, 400, 120)).toBe(0);
  });
});
