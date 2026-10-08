import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { verifyToken } from "../modules/auth/jwt.js";
import { isAllowedBrowserOrigin, isAllowedMutationOrigin, readSessionCookie } from "../modules/auth/sessionCookie.js";
import { ApiError } from "./apiError.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

function originOf(req: Request): string | undefined {
  return typeof req.headers.origin === "string" ? req.headers.origin : undefined;
}

/**
 * Bearer wins when the header is present. Otherwise the session cookie.
 * Null when the credential is missing, from a disallowed origin, or names a
 * session version the account has already left behind.
 */
export async function resolveSessionUserId(req: Request): Promise<string | null> {
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
  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { sessionVersion: true },
  });
  if (!user || user.sessionVersion !== payload.sv) return null;
  return payload.sub;
}

function isUnsafe(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const viaCookie = header === undefined && readSessionCookie(req) !== undefined;
  const origin = originOf(req);

  if (viaCookie && !isAllowedBrowserOrigin(origin)) {
    throw ApiError.forbidden("This session cannot be used from that origin");
  }
  // Browsers send Origin on POST. A cookie write with no Origin is rejected
  // so the missing-Origin exception used for safe reads cannot change state.
  if (viaCookie && isUnsafe(req.method) && !isAllowedMutationOrigin(origin)) {
    throw ApiError.forbidden("Open Cards Collect and try that again.");
  }

  const credentialPresented = header !== undefined || readSessionCookie(req) !== undefined;
  void resolveSessionUserId(req)
    .then((userId) => {
      if (!userId) {
        next(ApiError.unauthorized(credentialPresented ? "Invalid or expired session" : undefined));
        return;
      }
      (req as AuthenticatedRequest).userId = userId;
      next();
    })
    .catch(next);
}
