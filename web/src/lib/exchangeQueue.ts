/** Same rule as the home count: a proposal you received, or an accepted exchange you have not confirmed. */
export function exchangeNeedsYou(exchange: { status: string; role: string; you_confirmed: boolean }): boolean {
  if (exchange.status === "PROPOSED" && exchange.role === "counterparty") return true;
  if (exchange.status === "ACCEPTED" && !exchange.you_confirmed) return true;
  return false;
}

/** Needs-you first. The order inside each group stays the order the API returned. */
export function orderOpenExchanges<T extends { status: string; role: string; you_confirmed: boolean }>(
  exchanges: T[],
): T[] {
  const needsYou: T[] = [];
  const waiting: T[] = [];
  for (const exchange of exchanges) {
    if (exchangeNeedsYou(exchange)) needsYou.push(exchange);
    else waiting.push(exchange);
  }
  return [...needsYou, ...waiting];
}

export function openExchangeSummary(needsYou: number, waiting: number): string | null {
  const parts: string[] = [];
  if (needsYou === 1) parts.push("1 exchange needs you");
  else if (needsYou > 1) parts.push(`${needsYou} exchanges need you`);
  if (waiting === 1) parts.push("1 is waiting on the other person");
  else if (waiting > 1) parts.push(`${waiting} are waiting on the other person`);
  if (parts.length === 0) return null;
  return `${parts.join(". ")}.`;
}
