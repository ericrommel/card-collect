import { describe, expect, it } from "vitest";
import { conditionSummary } from "../../../web/src/lib/conditionSummary.ts";

describe("conditionSummary", () => {
  it("stays quiet when no copy has a condition", () => {
    expect(conditionSummary([])).toBeNull();
    expect(conditionSummary([null, null])).toBeNull();
  });

  it("uses the grade when every copy agrees", () => {
    expect(conditionSummary(["Played"])).toBe("Played");
    expect(conditionSummary(["Near Mint", "Near Mint"])).toBe("Near Mint");
  });

  it("says Mixed when copies differ, including a blank note", () => {
    expect(conditionSummary(["Mint", null])).toBe("Mixed");
    expect(conditionSummary(["Mint", "Good"])).toBe("Mixed");
  });
});
