import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
import { resolveSessionUserId } from "../../middleware/requireAuth.js";
import { catalogProvider } from "./localDbCatalogProvider.js";

export const catalogRouter = Router();

catalogRouter.get(
  "/universes",
  asyncHandler(async (_req, res) => {
    const universes = await catalogProvider.listUniverses();
    res.json({ universes });
  }),
);

const listSetsQuerySchema = z.object({
  universeId: z.string().optional(),
});

catalogRouter.get(
  "/sets",
  asyncHandler(async (req, res) => {
    const { universeId } = listSetsQuerySchema.parse(req.query);
    const sets = await catalogProvider.listSets(universeId);
    res.json({ sets });
  }),
);

catalogRouter.get(
  "/sets/:id",
  asyncHandler(async (req, res) => {
    const set = await catalogProvider.getSet(req.params.id);
    if (!set) throw ApiError.notFound("Set not found");
    res.json({ set });
  }),
);

const searchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
});

/** Enough to choose a card. A broader query says there are more, instead of returning the whole catalog. */
const SEARCH_LIMIT = 24;

catalogRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const { q = "" } = searchQuerySchema.parse(req.query);
    const { hits, truncated } = await catalogProvider.searchCollectibles(q, SEARCH_LIMIT);
    // A missing or rejected session still returns the catalog. Ownership is
    // added only for a session that still matches the account.
    const userId = await resolveSessionUserId(req);
    if (!userId) {
      res.json({ results: hits, truncated });
      return;
    }
    const counts = await ownedQuantities(
      userId,
      hits.map((hit) => hit.id),
    );
    res.json({
      results: hits.map((hit) => ({ ...hit, owned_quantity: counts.get(hit.id) ?? 0 })),
      truncated,
    });
  }),
);

/** How many physical copies this person has of each card. Other people are not counted. */
async function ownedQuantities(ownerId: string, collectibleIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (collectibleIds.length === 0) return counts;
  const copies = await prisma.userCopy.findMany({
    where: { ownerId, variant: { collectibleId: { in: collectibleIds } } },
    select: { variant: { select: { collectibleId: true } } },
  });
  for (const copy of copies) {
    const id = copy.variant.collectibleId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

catalogRouter.get(
  "/sets/:id/collectibles",
  asyncHandler(async (req, res) => {
    const set = await catalogProvider.getSet(req.params.id);
    if (!set) throw ApiError.notFound("Set not found");
    const collectibles = await catalogProvider.listCollectibles(req.params.id);
    res.json({ collectibles });
  }),
);
