import { describe, expect, it } from "vitest";
import {
  allowedActions,
  applyExchangeAction,
  previewOfferedCopies,
  selectCopiesForProposal,
  type ExchangeState,
  type PreviewCopy,
} from "../../src/domain/exchange.js";

const proposed: ExchangeState = { status: "PROPOSED", proposerConfirmed: false, counterpartyConfirmed: false };

function copy(partial: Partial<PreviewCopy> & Pick<PreviewCopy, "id" | "collectibleId">): PreviewCopy {
  return {
    ownerId: "owner",
    availability: "TRADE",
    reserved: false,
    createdAtMs: 0,
    condition: null,
    ...partial,
  };
}

describe("exchange lifecycle", () => {
  it("lets only the counterparty accept or decline a proposal", () => {
    expect(allowedActions(proposed, "COUNTERPARTY")).toEqual(["accept", "decline"]);
    expect(allowedActions(proposed, "PROPOSER")).toEqual(["cancel"]);
    expect(applyExchangeAction(proposed, "PROPOSER", "accept").ok).toBe(false);
    expect(applyExchangeAction(proposed, "COUNTERPARTY", "cancel").ok).toBe(false);

    expect(applyExchangeAction(proposed, "COUNTERPARTY", "accept")).toEqual({
      ok: true,
      state: { status: "ACCEPTED", proposerConfirmed: false, counterpartyConfirmed: false },
    });
    expect(applyExchangeAction(proposed, "COUNTERPARTY", "decline")).toEqual({
      ok: true,
      state: { status: "DECLINED", proposerConfirmed: false, counterpartyConfirmed: false },
    });
    expect(applyExchangeAction(proposed, "PROPOSER", "cancel")).toEqual({
      ok: true,
      state: { status: "CANCELLED", proposerConfirmed: false, counterpartyConfirmed: false },
    });
  });

  it("moves cards only once both people have confirmed, and either can still cancel before that", () => {
    const accepted: ExchangeState = { status: "ACCEPTED", proposerConfirmed: false, counterpartyConfirmed: false };
    expect(allowedActions(accepted, "PROPOSER")).toEqual(["confirm", "cancel"]);

    const proposerConfirmed = applyExchangeAction(accepted, "PROPOSER", "confirm");
    expect(proposerConfirmed).toEqual({
      ok: true,
      state: { status: "ACCEPTED", proposerConfirmed: true, counterpartyConfirmed: false },
    });

    const completed = applyExchangeAction(
      proposerConfirmed.ok ? proposerConfirmed.state : accepted,
      "COUNTERPARTY",
      "confirm",
    );
    expect(completed).toEqual({
      ok: true,
      state: { status: "COMPLETED", proposerConfirmed: true, counterpartyConfirmed: true },
    });

    const backedOut = applyExchangeAction(
      proposerConfirmed.ok ? proposerConfirmed.state : accepted,
      "COUNTERPARTY",
      "cancel",
    );
    expect(backedOut).toEqual({
      ok: true,
      state: { status: "CANCELLED", proposerConfirmed: false, counterpartyConfirmed: false },
    });
  });

  it("treats a repeated confirmation as a no-op, including after completion", () => {
    const accepted: ExchangeState = { status: "ACCEPTED", proposerConfirmed: true, counterpartyConfirmed: false };
    expect(applyExchangeAction(accepted, "PROPOSER", "confirm")).toEqual({ ok: true, state: accepted });
    expect(allowedActions(accepted, "PROPOSER")).toEqual(["cancel"]);

    const completed: ExchangeState = { status: "COMPLETED", proposerConfirmed: true, counterpartyConfirmed: true };
    expect(applyExchangeAction(completed, "COUNTERPARTY", "confirm")).toEqual({ ok: true, state: completed });
    expect(applyExchangeAction(completed, "PROPOSER", "cancel").ok).toBe(false);
    expect(allowedActions(completed, "PROPOSER")).toEqual([]);
  });

  it("rejects confirm before the exchange is accepted", () => {
    expect(applyExchangeAction(proposed, "COUNTERPARTY", "confirm").ok).toBe(false);
  });
});

describe("selectCopiesForProposal", () => {
  it("picks the oldest unreserved copy and leaves a newer duplicate free", () => {
    const copies = [
      copy({ id: "new", collectibleId: "c1", createdAtMs: 20 }),
      copy({ id: "old", collectibleId: "c1", createdAtMs: 10 }),
      copy({ id: "kept", collectibleId: "c1", availability: "KEEP", createdAtMs: 1 }),
    ];
    expect(selectCopiesForProposal(copies, ["c1"], "TRADE")).toEqual([
      { id: "old", ownerId: "owner", collectibleId: "c1", availability: "TRADE" },
    ]);
  });

  it("skips a reserved older copy", () => {
    const copies = [
      copy({ id: "old", collectibleId: "c1", createdAtMs: 10, reserved: true }),
      copy({ id: "new", collectibleId: "c1", createdAtMs: 20 }),
    ];
    expect(selectCopiesForProposal(copies, ["c1"], "TRADE")?.[0].id).toBe("new");
  });

  it("returns null instead of a partial selection when any card cannot be filled", () => {
    const copies = [copy({ id: "a", collectibleId: "c1", availability: "GIVE_AWAY" })];
    expect(selectCopiesForProposal(copies, ["c1"], "TRADE")).toBeNull();
    expect(selectCopiesForProposal(copies, ["c1", "c2"], "GIVE_AWAY")).toBeNull();
  });

  it("does not use one copy to fill the same collectible twice", () => {
    const copies = [copy({ id: "only", collectibleId: "c1" })];
    expect(selectCopiesForProposal(copies, ["c1", "c1"], "TRADE")).toBeNull();
  });
});

describe("previewOfferedCopies", () => {
  it("uses the oldest free copy, not the one with a nicer condition", () => {
    const copies = [
      copy({ id: "newer", collectibleId: "c1", createdAtMs: 20, condition: "Mint" }),
      copy({ id: "older", collectibleId: "c1", createdAtMs: 10, condition: "Played" }),
      copy({ id: "kept", collectibleId: "c1", availability: "KEEP", createdAtMs: 1, condition: "Mint" }),
    ];
    expect(previewOfferedCopies(copies, ["c1"], "TRADE")).toEqual([{ collectibleId: "c1", condition: "Played" }]);
  });

  it("shows a copy already reserved for this pair ahead of an older free duplicate", () => {
    const copies = [
      copy({ id: "free", collectibleId: "c1", createdAtMs: 10, condition: "Mint" }),
      copy({ id: "held", collectibleId: "c1", createdAtMs: 30, reserved: true, condition: "Good" }),
    ];
    expect(previewOfferedCopies(copies, ["c1"], "TRADE")).toEqual([{ collectibleId: "c1", condition: "Good" }]);
  });

  it("ignores a reserved copy of the wrong availability and an unset condition stays unset", () => {
    const copies = [
      copy({ id: "gift", collectibleId: "c1", availability: "GIVE_AWAY", reserved: true, condition: "Poor" }),
      copy({ id: "trade", collectibleId: "c1", condition: null }),
    ];
    expect(previewOfferedCopies(copies, ["c1"], "TRADE")).toEqual([{ collectibleId: "c1", condition: null }]);
  });

  it("returns null instead of labeling a card that has no eligible copy", () => {
    const copies = [copy({ id: "a", collectibleId: "c1", availability: "GIVE_AWAY", condition: "Good" })];
    expect(previewOfferedCopies(copies, ["c1"], "TRADE")).toBeNull();
    expect(previewOfferedCopies(copies, ["c1", "c2"], "GIVE_AWAY")).toBeNull();
  });

  it("keeps the requested order and does not reuse one copy", () => {
    const copies = [
      copy({ id: "a", collectibleId: "c2", condition: "Excellent" }),
      copy({ id: "b", collectibleId: "c1", condition: "Near Mint" }),
    ];
    expect(previewOfferedCopies(copies, ["c1", "c2"], "TRADE")).toEqual([
      { collectibleId: "c1", condition: "Near Mint" },
      { collectibleId: "c2", condition: "Excellent" },
    ]);
    expect(previewOfferedCopies(copies, ["c1", "c1"], "TRADE")).toBeNull();
  });
});
