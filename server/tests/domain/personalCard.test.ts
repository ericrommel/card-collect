import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_CONTACT_MESSAGE } from "../../src/modules/auth/displayName.js";
import {
  PERSONAL_CONTACT_MESSAGE,
  normalizePersonalNumber,
  normalizePersonalText,
  parsePersonalIdentity,
  personalNormalizedKey,
} from "../../src/domain/personalCard.js";

const base = {
  name: "Red Hawk",
  game: "Sample Game",
  setName: "First Set",
  noNumber: false,
  number: "OP-01",
};

describe("personal card identity", () => {
  it("uses the same contact refusal as a display name", () => {
    expect(PERSONAL_CONTACT_MESSAGE).toBe(DISPLAY_NAME_CONTACT_MESSAGE);
    const parsed = parsePersonalIdentity({ ...base, name: "see www.example.test" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe(DISPLAY_NAME_CONTACT_MESSAGE);
  });

  it("folds case, width, format characters, and spaces without dropping punctuation or diacritics", () => {
    expect(normalizePersonalText("  Red\u200B   Hawk  ")).toBe("red hawk");
    expect(normalizePersonalText("ﬁ")).toBe("fi");
    expect(normalizePersonalText("Straße")).toBe("strasse");
    expect(normalizePersonalText("Pokémon")).toBe("pokémon");
    expect(normalizePersonalText("Monkey.D.")).toBe("monkey.d.");
  });

  it("keeps only ASCII letters, digits, and hyphens in a collector number", () => {
    expect(normalizePersonalNumber(" op-01 001 ")).toBe("OP-01001");
    expect(normalizePersonalNumber("OP01/001")).toBe("OP01001");
    expect(normalizePersonalNumber("none")).toBe("NONE");
  });

  it("uses an empty number part when the card has no number, not the word none", () => {
    const numbered = personalNormalizedKey({ ...base, number: "none" });
    const empty = personalNormalizedKey({ ...base, number: null });
    expect(numbered).not.toBe(empty);
    expect(empty.endsWith(":0:") || empty.includes("\u001f0:")).toBe(true);
  });

  it("does not let a delimiter inside a name shift later fields", () => {
    const left = personalNormalizedKey({ game: "a\u001fb", setName: "c", name: "d", number: "1" });
    const right = personalNormalizedKey({ game: "a", setName: "b\u001fc", name: "d", number: "1" });
    expect(left).not.toBe(right);
  });

  it("requires an explicit no-number choice when the number is blank", () => {
    const blank = parsePersonalIdentity({ ...base, number: "   ", noNumber: false });
    expect(blank.ok).toBe(false);
    const marked = parsePersonalIdentity({ ...base, number: "OP-01", noNumber: true });
    expect(marked.ok).toBe(true);
    if (marked.ok) expect(marked.value.number).toBeNull();
  });

  it("rejects a field over its cap", () => {
    const parsed = parsePersonalIdentity({ ...base, game: "g".repeat(61) });
    expect(parsed.ok).toBe(false);
  });
});
