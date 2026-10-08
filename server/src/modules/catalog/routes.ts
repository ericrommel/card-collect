import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
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
    res.json({ results: hits, truncated });
  }),
);

catalogRouter.get(
  "/sets/:id/collectibles",
  asyncHandler(async (req, res) => {
    const set = await catalogProvider.getSet(req.params.id);
    if (!set) throw ApiError.notFound("Set not found");
    const collectibles = await catalogProvider.listCollectibles(req.params.id);
    res.json({ collectibles });
  }),
);
