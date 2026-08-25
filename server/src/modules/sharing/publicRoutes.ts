import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
import { getPublicShareView } from "./service.js";

/**
 * Unauthenticated, read-only. Deliberately GET-only — there is no route
 * here that could mutate a CollectionShare or UserCopy, so "public
 * endpoints cannot mutate collection data" holds by construction, not by
 * a runtime check.
 */
export const publicSharingRouter = Router();

publicSharingRouter.get(
  "/:shareId",
  asyncHandler(async (req, res) => {
    const view = await getPublicShareView(req.params.shareId);
    // A never-created, disabled, and revoked shareId are all indistinguishable
    // 404s — a client can never learn which case it hit.
    if (!view) throw ApiError.notFound("This collection isn't shared");
    res.json(view);
  }),
);
