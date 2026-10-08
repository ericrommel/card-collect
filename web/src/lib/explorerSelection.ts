/**
 * Selects every visible card, or clears those cards when they are already
 * selected. Cards that are not on screen stay selected. Does not mark
 * anything owned.
 */
export function toggleVisibleSelection(selectedIds: Iterable<string>, visibleIds: readonly string[]): Set<string> {
  const next = new Set(selectedIds);
  if (visibleIds.length === 0) return next;
  const allVisibleSelected = visibleIds.every((id) => next.has(id));
  if (allVisibleSelected) {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  return next;
}
