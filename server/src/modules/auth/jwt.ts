import jwt from "jsonwebtoken";
import { env } from "../../env.js";

export interface AuthTokenPayload {
  sub: string; // user id
  /** Session version. Tokens without it, or with a version the account no longer uses, are rejected. */
  sv: number;
}

/** Kept in sync with the web session cookie lifetime. */
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function signToken(userId: string, sessionVersion: number): string {
  const payload: AuthTokenPayload = { sub: userId, sv: sessionVersion };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: TOKEN_TTL_SECONDS });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === "string") return null;
    const { sub, sv } = decoded;
    if (typeof sub !== "string" || sub.length === 0) return null;
    if (typeof sv !== "number" || !Number.isInteger(sv) || sv < 0) return null;
    return { sub, sv };
  } catch {
    return null;
  }
}
