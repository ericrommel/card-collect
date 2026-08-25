import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../modules/auth/jwt.js";
import { ApiError } from "./apiError.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized();
  }
  const token = header.slice("Bearer ".length);
  const payload = verifyToken(token);
  if (!payload) {
    throw ApiError.unauthorized("Invalid or expired session");
  }
  (req as AuthenticatedRequest).userId = payload.sub;
  next();
}
