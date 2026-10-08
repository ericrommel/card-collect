import { describe, expect, it } from "vitest";
import { orderDashboardSets, type DashboardSetOrder } from "../../../web/src/lib/dashboardSets.ts";

function set(partial: Partial<DashboardSetOrder> & Pick<DashboardSetOrder, "code">): DashboardSetOrder {
  return {
    owned_count: 0,
    release_date: "2024-01-01",
    ...partial,
  };
}

describe("orderDashboardSets", () => {
  it("puts a started set ahead of an earlier untouched set", () => {
    const ordered = orderDashboardSets([
      set({ code: "SV-01", release_date: "2020-01-01", owned_count: 0 }),
      set({ code: "HA-01", release_date: "2024-06-01", owned_count: 10 }),
    ]);
    expect(ordered.map((item) => item.code)).toEqual(["HA-01", "SV-01"]);
  });

  it("puts the larger started set first", () => {
    const ordered = orderDashboardSets([
      set({ code: "HA-02", owned_count: 12 }),
      set({ code: "HA-01", owned_count: 144 }),
    ]);
    expect(ordered.map((item) => item.code)).toEqual(["HA-01", "HA-02"]);
  });

  it("keeps catalog order when ownership is the same", () => {
    const ordered = orderDashboardSets([
      set({ code: "HA-03", release_date: "2024-09-01", owned_count: 0 }),
      set({ code: "SV-01", release_date: null, owned_count: 0 }),
      set({ code: "HA-02", release_date: "2024-03-01", owned_count: 4 }),
      set({ code: "HA-01", release_date: "2024-01-01", owned_count: 4 }),
    ]);
    expect(ordered.map((item) => item.code)).toEqual(["HA-01", "HA-02", "HA-03", "SV-01"]);
  });

  it("does not change the caller's array", () => {
    const sets = [set({ code: "B", owned_count: 1 }), set({ code: "A", owned_count: 2 })];
    orderDashboardSets(sets);
    expect(sets.map((item) => item.code)).toEqual(["B", "A"]);
  });
});
