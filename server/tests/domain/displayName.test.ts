import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_CONTACT_MESSAGE, displayNameProblem } from "../../src/modules/auth/displayName.js";

describe("displayNameProblem", () => {
  it("allows a collector name", () => {
    expect(displayNameProblem("Alice (Luffy Fan)")).toBeNull();
    expect(displayNameProblem("Harbor Guide")).toBeNull();
    expect(displayNameProblem("at the harbor")).toBeNull();
    expect(displayNameProblem("Bob")).toBeNull();
  });

  it("rejects an email address or a link", () => {
    for (const name of [
      "a@b.com",
      "hello@there",
      "https://x.test",
      "HTTP://x.test",
      "http://x.test/card",
      "www.cards.test",
      "See WWW.Cards.test",
    ]) {
      expect(displayNameProblem(name)).toBe(DISPLAY_NAME_CONTACT_MESSAGE);
    }
  });
});
