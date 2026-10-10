/** Same refusal as a display name. Kept here so domain code does not import the auth module. */
const CONTACT_IN_TEXT = /[@]|https?:\/\/|www\./i;
export const PERSONAL_CONTACT_MESSAGE = "Use a name that isn't an email address or a link.";

function contactProblem(value: string): string | null {
  if (CONTACT_IN_TEXT.test(value)) return PERSONAL_CONTACT_MESSAGE;
  return null;
}

/** Caps for the words a person types. Counted after trim, in UTF-16 code units, same as other text fields. */
export const PERSONAL_LIMITS = {
  name: 80,
  game: 60,
  setName: 80,
  number: 16,
  optional: 40,
} as const;

export type PersonalIdentity = {
  name: string;
  game: string;
  setName: string;
  /** Null when the person marked that no collector number is printed. */
  number: string | null;
  noNumber: boolean;
  setCode: string | null;
  rarity: string | null;
  language: string | null;
};

const FIELD_LABEL: Record<keyof Pick<PersonalIdentity, "name" | "game" | "setName" | "number">, string> = {
  name: "Enter a card name.",
  game: "Enter the game.",
  setName: "Enter the set name.",
  number: "Enter the collector number, or mark that this card has no number.",
};

/**
 * Unicode default case fold for the duplicate key only.
 * `toLowerCase` is not locale-specific. German sharp S folds to "ss", which `toLowerCase` does not do.
 */
function casefold(value: string): string {
  return value
    .replace(/\u00DF/g, "ss")
    .replace(/\u1E9E/g, "ss")
    .toLowerCase();
}

/** Working text for a duplicate key: NFKC, no format characters, trimmed, casefolded, single spaces. */
export function normalizePersonalText(value: string): string {
  const stripped = value.normalize("NFKC").replace(/\p{Cf}/gu, "");
  return casefold(stripped).trim().replace(/\s+/gu, " ");
}

/** Collector number key. Spaces drop out. Only ASCII letters, digits, and hyphens remain. */
export function normalizePersonalNumber(value: string): string {
  const text = normalizePersonalText(value).replace(/ /g, "");
  return text.replace(/[^a-z0-9-]/g, "").toUpperCase();
}

/**
 * Versioned and length-prefixed so a delimiter inside a name cannot shift fields.
 * The number part is empty when the card has no printed number. It is never the word "none".
 */
export function personalNormalizedKey(
  identity: Pick<PersonalIdentity, "game" | "setName" | "name" | "number">,
): string {
  const parts = [
    normalizePersonalText(identity.game),
    normalizePersonalText(identity.setName),
    identity.number == null ? "" : normalizePersonalNumber(identity.number),
    normalizePersonalText(identity.name),
  ];
  return parts.reduce((key, part) => `${key}\u001f${part.length}:${part}`, "v1");
}

function trimmed(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .trim()
    .replace(/\s+/gu, " ");
}

function optionalField(
  value: string | null | undefined,
  label: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  const text = trimmed(value);
  if (!text) return { ok: true, value: null };
  if (text.length > PERSONAL_LIMITS.optional)
    return { ok: false, error: `${label} must be ${PERSONAL_LIMITS.optional} characters or fewer.` };
  if (contactProblem(text)) return { ok: false, error: PERSONAL_CONTACT_MESSAGE };
  return { ok: true, value: text };
}

export function parsePersonalIdentity(input: {
  name: string;
  game: string;
  setName: string;
  number?: string | null;
  noNumber: boolean;
  setCode?: string | null;
  rarity?: string | null;
  language?: string | null;
}): { ok: true; value: PersonalIdentity } | { ok: false; error: string } {
  const name = trimmed(input.name);
  const game = trimmed(input.game);
  const setName = trimmed(input.setName);
  if (!name) return { ok: false, error: FIELD_LABEL.name };
  if (!game) return { ok: false, error: FIELD_LABEL.game };
  if (!setName) return { ok: false, error: FIELD_LABEL.setName };
  if (name.length > PERSONAL_LIMITS.name)
    return { ok: false, error: `Card name must be ${PERSONAL_LIMITS.name} characters or fewer.` };
  if (game.length > PERSONAL_LIMITS.game)
    return { ok: false, error: `Game must be ${PERSONAL_LIMITS.game} characters or fewer.` };
  if (setName.length > PERSONAL_LIMITS.setName) {
    return { ok: false, error: `Set name must be ${PERSONAL_LIMITS.setName} characters or fewer.` };
  }
  for (const value of [name, game, setName]) {
    if (contactProblem(value)) return { ok: false, error: PERSONAL_CONTACT_MESSAGE };
  }

  let number: string | null = null;
  if (!input.noNumber) {
    number = trimmed(input.number ?? "");
    if (!number || !normalizePersonalNumber(number)) return { ok: false, error: FIELD_LABEL.number };
    if (number.length > PERSONAL_LIMITS.number) {
      return { ok: false, error: `Collector number must be ${PERSONAL_LIMITS.number} characters or fewer.` };
    }
    if (contactProblem(number)) return { ok: false, error: PERSONAL_CONTACT_MESSAGE };
  }

  const setCode = optionalField(input.setCode, "Set code");
  if (!setCode.ok) return setCode;
  const rarity = optionalField(input.rarity, "Rarity");
  if (!rarity.ok) return rarity;
  const language = optionalField(input.language, "Language");
  if (!language.ok) return language;

  return {
    ok: true,
    value: {
      name,
      game,
      setName,
      number,
      noNumber: input.noNumber,
      setCode: setCode.value,
      rarity: rarity.value,
      language: language.value,
    },
  };
}

export function parsePersonalPrinting(
  value: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  return optionalField(value, "Printing");
}
