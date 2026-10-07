/**
 * User-entered description of a physical copy. These are consumer words,
 * not a professional grade and not an AI estimate. The trade score does
 * not read them.
 */
export const CONDITION_GRADES = ["Mint", "Near Mint", "Excellent", "Good", "Played", "Poor"] as const;

export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export function isConditionGrade(value: string): value is ConditionGrade {
  return (CONDITION_GRADES as readonly string[]).includes(value);
}
