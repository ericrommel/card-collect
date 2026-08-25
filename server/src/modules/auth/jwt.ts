import jwt from "jsonwebtoken";
import { env } from "../../env.js";

export interface AuthTokenPayload {
  sub: string; // user id
}

const TOKEN_TTL = "7d";

export function signToken(userId: string): string {
  const payload: AuthTokenPayload = { sub: userId };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
  } catch {
    return null;
  }
}
