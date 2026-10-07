import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../modules/auth/jwt.js";
import { isAllowedBrowserOrigin, readSessionCookie } from "../modules/auth/sessionCookie.js";
import { ApiError } from "./apiError.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

function originOf(req: Request): string | undefined {
  return typeof req.headers.origin === "string" ? req.headers.origin : undefined;
}

/** Bearer wins when the header is present. Otherwise the session cookie. Null when there is no usable credential — including a cookie from a disallowed origin. */
export function optionalUserId(req: Request): string | null {
  const header = req.headers.authorization;
  let token: string | undefined;
  let viaCookie = false;

  if (header !== undefined) {
    if (!header.startsWith("Bearer ")) return null;
    token = header.slice("Bearer ".length).trim();
  } else {
    token = readSessionCookie(req);
    viaCookie = token !== undefined;
  }

  if (!token) return null;
  if (viaCookie && !isAllowedBrowserOrigin(originOf(req))) return null;
  return verifyToken(token)?.sub ?? null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const viaCookie = header === undefined && readSessionCookie(req) !== undefined;

  if (viaCookie && !isAllowedBrowserOrigin(originOf(req))) {
    throw ApiError.forbidden("This session cannot be used from that origin");
  }

  const userId = optionalUserId(req);
  if (!userId) {
    throw ApiError.unauthorized(header || readSessionCookie(req) ? "Invalid or expired session" : undefined);
  }
  (req as AuthenticatedRequest).userId = userId;
  next();
}
