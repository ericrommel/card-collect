/** Fields the home page needs in order to put a collection in progress first. */
export interface DashboardSetOrder {
  owned_count: number;
  release_date: string | null;
  code: string;
}

/**
 * Started sets come first, and the one with more owned cards comes before a
 * smaller one. Untouched sets keep catalog order. The API list stays in
 * release order; this is only how home presents it.
 */
export function orderDashboardSets<T extends DashboardSetOrder>(sets: T[]): T[] {
  return [...sets].sort((a, b) => {
    const started = Number(b.owned_count > 0) - Number(a.owned_count > 0);
    if (started !== 0) return started;
    if (a.owned_count !== b.owned_count) return b.owned_count - a.owned_count;
    const date = (a.release_date ?? "9999").localeCompare(b.release_date ?? "9999");
    if (date !== 0) return date;
    return a.code.localeCompare(b.code);
  });
}
