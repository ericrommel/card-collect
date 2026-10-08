import { describe, expect, it } from "vitest";
import { cardMotif, kindFromMetadata } from "../../../web/src/lib/cardMotif.ts";

describe("cardMotif", () => {
  it("keeps the four catalog kinds and ignores anything else", () => {
    expect(cardMotif("Place")).toBe("Place");
    expect(cardMotif("Person")).toBe("Person");
    expect(cardMotif("Object")).toBe("Object");
    expect(cardMotif("Event")).toBe("Event");
    expect(cardMotif("place")).toBeNull();
    expect(cardMotif(null)).toBeNull();
    expect(cardMotif(undefined)).toBeNull();
  });

  it("reads kind from catalog metadata", () => {
    expect(kindFromMetadata({ kind: "Object", ink: "Sea" })).toBe("Object");
    expect(kindFromMetadata({ ink: "Sea" })).toBeNull();
    expect(kindFromMetadata(null)).toBeNull();
  });
});
