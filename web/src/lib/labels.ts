import type { Availability, ExchangeStatus } from "./api";

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  KEEP: "Keep",
  TRADE: "For trade",
  SELL: "For sale",
  GIVE_AWAY: "Donation",
};

export const AVAILABILITY_OPTIONS: Availability[] = ["KEEP", "TRADE", "SELL", "GIVE_AWAY"];

export const EXCHANGE_STATUS_LABEL: Record<ExchangeStatus, string> = {
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

/** Plain completion change. A drop means every copy of some card would leave. */
export function completionShift(who: string, before: number, after: number): string {
  if (before === after) return `${who} stays at ${before}%.`;
  const direction = after < before ? " A card without another copy would leave." : "";
  return `${who} goes from ${before}% to ${after}%.${direction}`;
}

export function titleCaseKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Readable rarity names. Unknown values stay as stored, including full words from a sample catalog. */
const RARITY_LABEL: Record<string, string> = {
  C: "Common",
  UC: "Uncommon",
  R: "Rare",
  SR: "Super Rare",
  SEC: "Secret",
  L: "Leader",
};

export function rarityLabel(rarity: string | null | undefined): string | null {
  if (!rarity) return null;
  return RARITY_LABEL[rarity] ?? rarity;
}
