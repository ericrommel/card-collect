import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import { buildDashboard } from "./service.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).userId;
    res.json(await buildDashboard(userId));
  }),
);
