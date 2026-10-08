import { describe, expect, it } from "vitest";
import { frontPhotoCopy } from "../../../web/src/lib/ownedPhoto.ts";

describe("frontPhotoCopy", () => {
  it("uses the first copy that has a front photo", () => {
    const copies = [
      { id: "plain", has_front_image: false },
      { id: "front", has_front_image: true },
      { id: "later", has_front_image: true },
    ];
    expect(frontPhotoCopy(copies)?.id).toBe("front");
  });

  it("stays on the sample drawing when no copy has a front photo", () => {
    expect(frontPhotoCopy([])).toBeNull();
    expect(frontPhotoCopy([{ id: "back-only", has_front_image: false }])).toBeNull();
  });
});
