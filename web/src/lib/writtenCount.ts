/** Notes and extra physical copies. This is never a catalog completion percent. */
export function writtenCountSentence(noteCount: number, extraCount: number): string {
  const notes = noteCount === 1 ? "1 note" : `${noteCount} notes`;
  const extras =
    extraCount === 0 ? "No extra copies" : extraCount === 1 ? "1 extra copy" : `${extraCount} extra copies`;
  return `${notes}. ${extras}.`;
}
