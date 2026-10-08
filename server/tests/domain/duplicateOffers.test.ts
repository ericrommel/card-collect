import { describe, expect, it } from "vitest";
import {
  duplicateOfferStatus,
  planDuplicateOffers,
  type DuplicateCopyRef,
} from "../../../web/src/lib/duplicateOffers.ts";

function copy(partial: Partial<DuplicateCopyRef> & Pick<DuplicateCopyRef, "id">): DuplicateCopyRef {
  return {
    availability: "KEEP",
    reserved: false,
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("planDuplicateOffers", () => {
  it("skips a card that has only one free copy", () => {
    const plan = planDuplicateOffers([[copy({ id: "only" })]]);
    expect(plan).toMatchObject({ keepIds: [], offerIds: [], cards: 0, extras: 0, skippedSingle: 1 });
  });

  it("keeps the copy already marked Keep and offers the newer extra", () => {
    const plan = planDuplicateOffers([
      [
        copy({ id: "older", created_at: "2026-01-01T00:00:00.000Z" }),
        copy({ id: "newer", created_at: "2026-02-01T00:00:00.000Z" }),
      ],
    ]);
    expect(plan.keepIds).toEqual([]);
    expect(plan.offerIds).toEqual(["newer"]);
    expect(plan).toMatchObject({ cards: 1, extras: 1, skippedSingle: 0 });
  });

  it("turns the oldest copy back to Keep when every extra is already for trade", () => {
    const plan = planDuplicateOffers([
      [
        copy({ id: "b", availability: "TRADE", created_at: "2026-03-01T00:00:00.000Z" }),
        copy({ id: "a", availability: "TRADE", created_at: "2026-01-01T00:00:00.000Z" }),
      ],
    ]);
    expect(plan.keepIds).toEqual(["a"]);
    expect(plan.offerIds).toEqual([]);
    expect(duplicateOfferStatus(plan)).toBe("Kept one copy of 1 card and marked 1 extra for trade.");
  });

  it("does not offer a copy that is reserved for an exchange", () => {
    const plan = planDuplicateOffers([
      [copy({ id: "kept" }), copy({ id: "reserved", availability: "TRADE", reserved: true })],
    ]);
    expect(plan).toMatchObject({ cards: 0, extras: 0, skippedSingle: 1 });
  });

  it("offers every free extra and leaves a reserved copy alone", () => {
    const plan = planDuplicateOffers([
      [
        copy({ id: "keep" }),
        copy({ id: "sale", availability: "SELL", created_at: "2026-02-01T00:00:00.000Z" }),
        copy({ id: "gift", availability: "GIVE_AWAY", created_at: "2026-03-01T00:00:00.000Z" }),
        copy({ id: "locked", reserved: true, created_at: "2026-04-01T00:00:00.000Z" }),
      ],
      [copy({ id: "single" })],
    ]);
    expect(plan.keepIds).toEqual([]);
    expect(plan.offerIds).toEqual(["sale", "gift"]);
    expect(plan).toMatchObject({ cards: 1, extras: 2, skippedSingle: 1 });
    expect(duplicateOfferStatus(plan)).toBe(
      "Kept one copy of 1 card and marked 2 extras for trade. Left 1 card unchanged because there isn't a free duplicate.",
    );
  });
});
