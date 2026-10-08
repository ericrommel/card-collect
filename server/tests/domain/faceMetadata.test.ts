import { describe, expect, it } from "vitest";
import { catalogFace } from "../../src/catalog/faceMetadata.js";

describe("catalogFace", () => {
  it("keeps a known kind and ink and drops every other key", () => {
    expect(catalogFace({ kind: "Place", ink: "Sea", note: "secret@example.com" })).toEqual({
      kind: "Place",
      ink: "Sea",
    });
    expect(catalogFace('{"kind":"Object","ink":"Ember","url":"https://example.com"}')).toEqual({
      kind: "Object",
      ink: "Ember",
    });
  });

  it("drops an unknown, mistyped, or missing label", () => {
    expect(catalogFace({ kind: "place", ink: "Blue" })).toEqual({ kind: null, ink: null });
    expect(catalogFace({ kind: "https://example.com", ink: "Sea" })).toEqual({ kind: null, ink: "Sea" });
    expect(catalogFace(null)).toEqual({ kind: null, ink: null });
    expect(catalogFace(undefined)).toEqual({ kind: null, ink: null });
    expect(catalogFace("not-json")).toEqual({ kind: null, ink: null });
    expect(catalogFace([])).toEqual({ kind: null, ink: null });
  });
});
