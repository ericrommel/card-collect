import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./apiError.js";
import { isAllowedMutationOrigin } from "../modules/auth/sessionCookie.js";

function originOf(req: Request): string | undefined {
  return typeof req.headers.origin === "string" ? req.headers.origin : undefined;
}

/**
 * Browser sign-in must come from the app. A client that asks for a bearer
 * token is exempt: that header is not allowed on a cross-site form post,
 * and the CORS preflight only succeeds for the configured app origin.
 */
export function requireAppOrigin(req: Request, _res: Response, next: NextFunction) {
  if (req.header("x-auth-mode") === "bearer") {
    next();
    return;
  }
  if (!isAllowedMutationOrigin(originOf(req))) {
    throw ApiError.forbidden("Open Cards Collect to sign in.");
  }
  next();
}
