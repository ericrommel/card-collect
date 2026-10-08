function copies(count: number): string {
  return count === 1 ? "1 copy" : `${count} copies`;
}

const HELD = "Copies in an open exchange stay as they are.";

/** The question shown before every free copy of the selection changes availability. */
export function bulkAvailabilityConfirm(count: number, label: string): string {
  return `Mark ${copies(count)} as ${label}? ${HELD}`;
}

/** The question shown before every free copy of the selection changes condition. */
export function bulkConditionConfirm(count: number, condition: string | null): string {
  if (condition == null) return `Clear the condition on ${copies(count)}? ${HELD}`;
  return `Set ${copies(count)} to ${condition}? ${HELD}`;
}
