import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import { getOwnShareSettings, regenerateShareId, updateShareSettings, type OwnShareSettings } from "./service.js";

/**
 * Authenticated "my share settings" routes, mounted at /api/my/sets so
 * they read as a sub-resource of a set — same base path as the progress
 * routes in modules/collection/routes.ts, but a separate router/module,
 * per the "keep sharing logic separate from collection-domain
 * calculations" requirement. Every route below is scoped to req.userId
 * only; there is no route that accepts another user's id, so cross-user
 * mutation isn't a 404-guarded edge case here — it's structurally
 * unreachable.
 */
export const mySharingRouter = Router();
mySharingRouter.use(requireAuth);

function userId(req: import("express").Request): string {
  return (req as AuthenticatedRequest).userId;
}

const visibilitySchema = z
  .object({
    completion: z.boolean().optional(),
    owned: z.boolean().optional(),
    missing: z.boolean().optional(),
    duplicates: z.boolean().optional(),
    trade: z.boolean().optional(),
    give_away: z.boolean().optional(),
  })
  .optional();

const updateShareSchema = z.object({
  enabled: z.boolean().optional(),
  visibility: visibilitySchema,
});

function mapVisibility(v: z.infer<typeof visibilitySchema>) {
  if (!v) return undefined;
  const mapped: Record<string, boolean> = {};
  if (v.completion !== undefined) mapped.showCompletion = v.completion;
  if (v.owned !== undefined) mapped.showOwned = v.owned;
  if (v.missing !== undefined) mapped.showMissing = v.missing;
  if (v.duplicates !== undefined) mapped.showDuplicates = v.duplicates;
  if (v.trade !== undefined) mapped.showTrade = v.trade;
  if (v.give_away !== undefined) mapped.showGiveAway = v.give_away;
  return mapped;
}

/** Owner-facing shape only — always includes share_id (even while disabled) since the owner already controls it; only the public endpoint enforces enabled. */
function toJson(settings: OwnShareSettings) {
  return {
    enabled: settings.enabled,
    share_id: settings.shareId,
    visibility: {
      completion: settings.visibility.showCompletion,
      owned: settings.visibility.showOwned,
      missing: settings.visibility.showMissing,
      duplicates: settings.visibility.showDuplicates,
      trade: settings.visibility.showTrade,
      give_away: settings.visibility.showGiveAway,
    },
  };
}

mySharingRouter.get(
  "/:id/share",
  asyncHandler(async (req, res) => {
    const settings = await getOwnShareSettings(userId(req), req.params.id);
    res.json({ share: settings ? toJson(settings) : null });
  }),
);

mySharingRouter.put(
  "/:id/share",
  asyncHandler(async (req, res) => {
    const body = updateShareSchema.parse(req.body);
    const settings = await updateShareSettings(userId(req), req.params.id, {
      enabled: body.enabled,
      visibility: mapVisibility(body.visibility),
    });
    res.json({ share: toJson(settings) });
  }),
);

mySharingRouter.post(
  "/:id/share/regenerate",
  asyncHandler(async (req, res) => {
    const settings = await regenerateShareId(userId(req), req.params.id);
    res.json({ share: toJson(settings) });
  }),
);
