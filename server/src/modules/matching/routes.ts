import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import { computeMatchesForUser } from "./service.js";

export const matchesRouter = Router();
matchesRouter.use(requireAuth);

const querySchema = z.object({ setId: z.string().min(1) });

matchesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest("setId query parameter is required");
    }
    const userId = (req as AuthenticatedRequest).userId;
    const matches = await computeMatchesForUser(userId, parsed.data.setId);
    res.json({ matches });
  })
);
