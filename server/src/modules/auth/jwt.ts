import jwt from "jsonwebtoken";
import { env } from "../../env.js";

export interface AuthTokenPayload {
  sub: string; // user id
}

/** Kept in sync with the web session cookie lifetime. */
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function signToken(userId: string): string {
  const payload: AuthTokenPayload = { sub: userId };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: TOKEN_TTL_SECONDS });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
  } catch {
    return null;
  }
}
