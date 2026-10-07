/**
 * Lifecycle of a trade or donation between two collectors.
 *
 * PROPOSED  — the proposer asked; copies are reserved; nothing has moved.
 * ACCEPTED  — the counterparty agreed. Still nothing moves until BOTH
 *             people confirm the cards actually changed hands.
 * COMPLETED — both confirmed; ownership of the reserved copies transfers.
 * DECLINED  — the counterparty said no while the exchange was PROPOSED.
 * CANCELLED — the proposer withdrew a proposal, or either person backed
 *             out after acceptance but before both confirmations.
 *
 * There is no IN_PROGRESS state. The app has no shipping or payment, so a
 * middle state would not describe anything the system can observe.
 * Either person can cancel until both have confirmed, so a deal is never
 * trapped in the database.
 *
 * Pure: no Prisma, no clock. Callers persist the resulting state.
 */

export type ExchangeStatus = "PROPOSED" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "COMPLETED";

export type ParticipantRole = "PROPOSER" | "COUNTERPARTY";

export type ExchangeAction = "accept" | "decline" | "cancel" | "confirm";

export interface ExchangeState {
  status: ExchangeStatus;
  proposerConfirmed: boolean;
  counterpartyConfirmed: boolean;
}

export function isOpenStatus(status: ExchangeStatus): boolean {
  return status === "PROPOSED" || status === "ACCEPTED";
}

/** Actions the role may take right now. Confirm is omitted once that person has already confirmed. */
export function allowedActions(state: ExchangeState, role: ParticipantRole): ExchangeAction[] {
  if (state.status === "PROPOSED") {
    return role === "COUNTERPARTY" ? ["accept", "decline"] : ["cancel"];
  }
  if (state.status === "ACCEPTED") {
    const alreadyConfirmed = role === "PROPOSER" ? state.proposerConfirmed : state.counterpartyConfirmed;
    return alreadyConfirmed ? ["cancel"] : ["confirm", "cancel"];
  }
  return [];
}

export type TransitionResult = { ok: true; state: ExchangeState } | { ok: false };

/**
 * Apply an action. Confirm is idempotent: repeating it after this person
 * has already confirmed (including once the exchange is COMPLETED) returns
 * the current state instead of an error, so a double-submit is safe.
 * Every other action on a state that doesn't list it is rejected.
 */
export function applyExchangeAction(
  state: ExchangeState,
  role: ParticipantRole,
  action: ExchangeAction,
): TransitionResult {
  if (action === "confirm") {
    if (state.status === "COMPLETED") return { ok: true, state };
    if (state.status === "ACCEPTED") {
      const alreadyConfirmed = role === "PROPOSER" ? state.proposerConfirmed : state.counterpartyConfirmed;
      if (alreadyConfirmed) return { ok: true, state };
      const next: ExchangeState = {
        status: "ACCEPTED",
        proposerConfirmed: role === "PROPOSER" ? true : state.proposerConfirmed,
        counterpartyConfirmed: role === "COUNTERPARTY" ? true : state.counterpartyConfirmed,
      };
      if (next.proposerConfirmed && next.counterpartyConfirmed) {
        next.status = "COMPLETED";
      }
      return { ok: true, state: next };
    }
    return { ok: false };
  }

  if (!allowedActions(state, role).includes(action)) return { ok: false };

  if (action === "accept") {
    return {
      ok: true,
      state: { status: "ACCEPTED", proposerConfirmed: false, counterpartyConfirmed: false },
    };
  }

  const closed: ExchangeStatus = action === "decline" ? "DECLINED" : "CANCELLED";
  return {
    ok: true,
    state: { status: closed, proposerConfirmed: false, counterpartyConfirmed: false },
  };
}

export interface OfferableCopy {
  id: string;
  ownerId: string;
  collectibleId: string;
  availability: "KEEP" | "TRADE" | "SELL" | "GIVE_AWAY";
  reserved: boolean;
  createdAtMs: number;
}

export interface SelectedCopy {
  id: string;
  ownerId: string;
  collectibleId: string;
  availability: "TRADE" | "GIVE_AWAY";
}

/**
 * One physical copy per requested collectible.
 * Eligible: the requested availability, and not already reserved.
 * Among those, the oldest copy wins (createdAt, then id) so the choice
 * does not depend on database row order and a newer duplicate stays free.
 * Returns null if any requested collectible cannot be filled — callers
 * must not create a partial exchange.
 */
export function selectCopiesForProposal(
  copies: readonly OfferableCopy[],
  collectibleIds: readonly string[],
  availability: "TRADE" | "GIVE_AWAY",
): SelectedCopy[] | null {
  const eligible = copies
    .filter((copy) => copy.availability === availability && !copy.reserved)
    .slice()
    .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));

  const used = new Set<string>();
  const chosen: SelectedCopy[] = [];

  for (const collectibleId of collectibleIds) {
    const copy = eligible.find((candidate) => candidate.collectibleId === collectibleId && !used.has(candidate.id));
    if (!copy) return null;
    used.add(copy.id);
    chosen.push({ id: copy.id, ownerId: copy.ownerId, collectibleId, availability });
  }

  return chosen;
}
