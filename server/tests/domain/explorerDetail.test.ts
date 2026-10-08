import { describe, expect, it } from "vitest";
import { explorerDetail } from "../../../web/src/lib/explorerDetail.ts";

describe("explorerDetail", () => {
  it("shows the focused card when select mode is off", () => {
    expect(explorerDetail({ selecting: false, narrow: true, inspect: false, selected: [], focus: "harbor" })).toEqual({
      mode: "single",
      entries: ["harbor"],
    });
    expect(explorerDetail({ selecting: false, narrow: false, inspect: true, selected: ["a"], focus: null })).toBeNull();
  });

  it("opens one or two selected cards beside a wide grid", () => {
    expect(explorerDetail({ selecting: true, narrow: false, inspect: false, selected: ["a"], focus: null })).toEqual({
      mode: "single",
      entries: ["a"],
    });
    expect(
      explorerDetail({ selecting: true, narrow: false, inspect: false, selected: ["a", "b"], focus: null }),
    ).toEqual({ mode: "compare", entries: ["a", "b"] });
    expect(
      explorerDetail({ selecting: true, narrow: false, inspect: false, selected: ["a", "b", "c"], focus: null }),
    ).toBeNull();
  });

  it("keeps a narrow grid clear until the person asks to see the selection", () => {
    expect(explorerDetail({ selecting: true, narrow: true, inspect: false, selected: ["a"], focus: "a" })).toBeNull();
    expect(
      explorerDetail({ selecting: true, narrow: true, inspect: false, selected: ["a", "b"], focus: null }),
    ).toBeNull();
    expect(explorerDetail({ selecting: true, narrow: true, inspect: true, selected: ["a"], focus: null })).toEqual({
      mode: "single",
      entries: ["a"],
    });
    expect(explorerDetail({ selecting: true, narrow: true, inspect: true, selected: ["a", "b"], focus: null })).toEqual(
      { mode: "compare", entries: ["a", "b"] },
    );
    expect(
      explorerDetail({ selecting: true, narrow: true, inspect: true, selected: ["a", "b", "c"], focus: null }),
    ).toBeNull();
  });
});
