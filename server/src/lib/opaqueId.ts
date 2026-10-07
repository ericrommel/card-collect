import { randomBytes } from "node:crypto";

/**
 * 18 random bytes (144 bits) as base64url, about 24 characters.
 * Used for public share links and collector refs. Deliberately not a
 * cuid: cuids are not cryptographic and carry structural information.
 */
export function generateOpaqueId(): string {
  return randomBytes(18).toString("base64url");
}
