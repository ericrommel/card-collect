/**
 * One shared condition, "Mixed" when the copies do not all agree, or null
 * when every copy is unset. An empty list is unset, not mixed.
 */
export function conditionSummary(conditions: Array<string | null | undefined>): string | null {
  const known = conditions.filter((grade): grade is string => Boolean(grade));
  if (known.length === 0) return null;
  if (known.length !== conditions.length) return "Mixed";
  const first = known[0];
  if (known.some((grade) => grade !== first)) return "Mixed";
  return first;
}
