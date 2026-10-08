import { describe, expect, it } from "vitest";
import { toggleVisibleSelection } from "../../../web/src/lib/explorerSelection.ts";

describe("toggleVisibleSelection", () => {
  it("selects the cards on screen without dropping a card that is already selected", () => {
    const selected = new Set(["kept"]);
    expect([...toggleVisibleSelection(selected, ["a", "b"])].sort()).toEqual(["a", "b", "kept"]);
    expect([...selected]).toEqual(["kept"]);
  });

  it("clears only the cards on screen when they are already selected", () => {
    expect([...toggleVisibleSelection(new Set(["a", "b", "kept"]), ["b", "a"])].sort()).toEqual(["kept"]);
  });

  it("leaves the selection alone when nothing is on screen", () => {
    expect([...toggleVisibleSelection(new Set(["a"]), [])]).toEqual(["a"]);
  });
});
