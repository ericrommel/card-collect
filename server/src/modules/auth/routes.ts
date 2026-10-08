import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
import { optionalUserId, requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import { requireAppOrigin } from "../../middleware/requireAppOrigin.js";
import { createHitWindow } from "../../lib/hitWindow.js";
import { generateOpaqueId } from "../../lib/opaqueId.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken } from "./jwt.js";
import { clearSessionCookie, setSessionCookie } from "./sessionCookie.js";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(60),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** Never return email, password hash, or internal metadata to anyone but the account owner's own /me. */
function toSelfProfile(user: { id: string; email: string; displayName: string; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    created_at: user.createdAt.toISOString(),
  };
}

function wantsBearerToken(req: import("express").Request): boolean {
  return req.header("x-auth-mode") === "bearer";
}

/** Browser sessions travel in an httpOnly cookie. The raw JWT is returned only to a client that asks for bearer mode (tests, a future mobile app). */
function issueSession(
  req: import("express").Request,
  res: import("express").Response,
  user: Parameters<typeof toSelfProfile>[0],
  status: number,
) {
  const token = signToken(user.id);
  setSessionCookie(res, token);
  res.status(status).json({
    ...(wantsBearerToken(req) ? { token } : {}),
    user: toSelfProfile(user),
  });
}

/** Shared by register and login so guessing either one spends the same budget. */
export const authHitWindow = createHitWindow(60_000);

export function authAttemptLimit(): number {
  if (process.env.AUTH_RATE_LIMIT) {
    const parsed = Number(process.env.AUTH_RATE_LIMIT);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return process.env.VITEST ? 10_000 : 20;
}

function limitAuthAttempts(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  if (authHitWindow.tooMany(`auth:${req.ip ?? "unknown"}`, authAttemptLimit())) {
    res.setHeader("Retry-After", "60");
    throw ApiError.tooManyRequests("Too many attempts. Wait a minute and try again.");
  }
  next();
}

export const authRouter = Router();

authRouter.post(
  "/register",
  requireAppOrigin,
  limitAuthAttempts,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw ApiError.conflict("An account with this email already exists");
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        publicId: generateOpaqueId(),
      },
    });

    issueSession(req, res, user, 201);
  }),
);

authRouter.post(
  "/login",
  requireAppOrigin,
  limitAuthAttempts,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    issueSession(req, res, user, 200);
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (_req, res) => {
    clearSessionCookie(res);
    res.status(204).send();
  }),
);

authRouter.get(
  "/session",
  asyncHandler(async (req, res) => {
    const userId = optionalUserId(req);
    if (!userId) {
      res.json({ user: null });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    res.json({ user: user ? toSelfProfile(user) : null });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw ApiError.unauthorized();
    }
    res.json({ user: toSelfProfile(user) });
  }),
);
