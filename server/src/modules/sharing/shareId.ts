import { randomBytes } from "node:crypto";

/**
 * A public share identifier: 18 random bytes (144 bits) as base64url,
 * ~24 characters. Deliberately generated independently of the row's
 * primary key (a cuid, which is not cryptographically random) so it
 * carries no sequential/structural information an attacker could use to
 * guess a neighboring share.
 */
export function generateShareId(): string {
  return randomBytes(18).toString("base64url");
}
