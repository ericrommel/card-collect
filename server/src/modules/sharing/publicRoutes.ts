import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
import { getPublicShareView, noteShareOpen } from "./service.js";

/**
 * Unauthenticated and GET-only. A successful response records how many
 * times the page was loaded and when, on the share row. It does not record
 * who opened it, and it does not change cards, visibility, or the link.
 * There is no PUT/POST/DELETE on this router.
 */
export const publicSharingRouter = Router();

publicSharingRouter.get(
  "/:shareId",
  asyncHandler(async (req, res) => {
    const view = await getPublicShareView(req.params.shareId);
    // A never-created, disabled, expired, and revoked shareId are all
    // indistinguishable 404s — a client can never learn which case it hit.
    // Those misses are not counted.
    if (!view) throw ApiError.notFound("This collection isn't shared");
    await noteShareOpen(req.params.shareId);
    res.json(view);
  }),
);
