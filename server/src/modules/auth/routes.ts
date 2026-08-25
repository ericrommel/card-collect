import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken } from "./jwt.js";

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

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw ApiError.conflict("An account with this email already exists");
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { email: body.email, passwordHash, displayName: body.displayName },
    });

    const token = signToken(user.id);
    res.status(201).json({ token, user: toSelfProfile(user) });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const token = signToken(user.id);
    res.json({ token, user: toSelfProfile(user) });
  })
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
  })
);
