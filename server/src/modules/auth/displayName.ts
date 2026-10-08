/** Public shares, matches, and exchanges show this name. */
const CONTACT_IN_NAME = /[@]|https?:\/\/|www\./i;

export const DISPLAY_NAME_CONTACT_MESSAGE = "Use a name that isn't an email address or a link.";

/** The caller trims the name first. Returns the refusal sentence, or null when other collectors can see it. */
export function displayNameProblem(value: string): string | null {
  if (CONTACT_IN_NAME.test(value)) return DISPLAY_NAME_CONTACT_MESSAGE;
  return null;
}
