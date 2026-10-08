import { describe, expect, it } from "vitest";
import { bulkAvailabilityConfirm, bulkConditionConfirm } from "../../../web/src/lib/bulkConfirm.ts";

describe("bulk confirm questions", () => {
  it("names one copy and the availability", () => {
    expect(bulkAvailabilityConfirm(1, "For trade")).toBe(
      "Mark 1 copy as For trade? Copies in an open exchange stay as they are.",
    );
  });

  it("names several copies and a donation", () => {
    expect(bulkAvailabilityConfirm(4, "Donation")).toBe(
      "Mark 4 copies as Donation? Copies in an open exchange stay as they are.",
    );
  });

  it("asks before a condition is set or cleared", () => {
    expect(bulkConditionConfirm(1, "Near Mint")).toBe(
      "Set 1 copy to Near Mint? Copies in an open exchange stay as they are.",
    );
    expect(bulkConditionConfirm(3, null)).toBe(
      "Clear the condition on 3 copies? Copies in an open exchange stay as they are.",
    );
  });
});
