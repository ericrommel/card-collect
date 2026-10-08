/** A physical copy the explorer can offer without touching a reserved one. */
export interface DuplicateCopyRef {
  id: string;
  availability: string;
  reserved: boolean;
  created_at: string;
}

export interface DuplicateOfferPlan {
  /** Free copies that should become Keep, so one copy of the card stays in the collection. */
  keepIds: string[];
  /** Free extras that are not already for trade. */
  offerIds: string[];
  /** Cards that have at least two free copies. */
  cards: number;
  /** Free copies beyond the one that stays Keep. */
  extras: number;
  /** Cards with exactly one free copy. */
  skippedSingle: number;
}

/**
 * Keep one free copy of each card and offer the rest for trade.
 * The copy already marked Keep stays. Otherwise the oldest free copy stays.
 * Reserved copies are left alone. A card with fewer than two free copies is skipped.
 */
export function planDuplicateOffers(groups: DuplicateCopyRef[][]): DuplicateOfferPlan {
  const keepIds: string[] = [];
  const offerIds: string[] = [];
  let cards = 0;
  let extras = 0;
  let skippedSingle = 0;

  for (const copies of groups) {
    const free = copies
      .filter((copy) => !copy.reserved)
      .slice()
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
    if (free.length < 2) {
      if (free.length === 1) skippedSingle += 1;
      continue;
    }
    cards += 1;
    extras += free.length - 1;
    const keep = free.find((copy) => copy.availability === "KEEP") ?? free[0];
    if (keep.availability !== "KEEP") keepIds.push(keep.id);
    for (const copy of free) {
      if (copy.id !== keep.id && copy.availability !== "TRADE") offerIds.push(copy.id);
    }
  }

  return { keepIds, offerIds, cards, extras, skippedSingle };
}

/** The question shown before any copy is changed. Cancel leaves the collection as it is. */
export function duplicateOfferConfirm(plan: DuplicateOfferPlan): string {
  const cards = plan.cards === 1 ? "1 card" : `${plan.cards} cards`;
  const extras = plan.extras === 1 ? "1 extra" : `${plan.extras} extras`;
  let message = `Keep one copy of ${cards} and mark ${extras} for trade?`;
  if (plan.skippedSingle === 1) {
    message += " 1 card with only one free copy stays as it is.";
  } else if (plan.skippedSingle > 1) {
    message += ` ${plan.skippedSingle} cards with only one free copy stay as they are.`;
  }
  return message;
}

export function duplicateOfferStatus(plan: DuplicateOfferPlan): string {
  const cards = plan.cards === 1 ? "1 card" : `${plan.cards} cards`;
  const extras = plan.extras === 1 ? "1 extra" : `${plan.extras} extras`;
  let status = `Kept one copy of ${cards} and marked ${extras} for trade.`;
  if (plan.skippedSingle > 0) {
    const left = plan.skippedSingle === 1 ? "1 card" : `${plan.skippedSingle} cards`;
    status += ` Left ${left} unchanged because there isn't a free duplicate.`;
  }
  return status;
}
