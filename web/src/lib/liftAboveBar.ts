/** How far to scroll so a card clears the selection bar without sliding under the tools. */
export function liftShift(rect: { top: number; bottom: number }, barTop: number, topLimit: number): number {
  const overlap = rect.bottom - (barTop - 8);
  if (overlap <= 0) return 0;
  return Math.min(overlap, Math.max(0, rect.top - topLimit));
}
