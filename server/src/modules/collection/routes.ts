import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import { computeSetProgressForUser, getUserCopies, type CopyWithDetails } from "./service.js";

export const collectionRouter = Router();
collectionRouter.use(requireAuth);

function userId(req: import("express").Request): string {
  return (req as AuthenticatedRequest).userId;
}

function toPublicCopy(copy: CopyWithDetails) {
  return {
    id: copy.id,
    availability: copy.availability,
    condition: copy.condition,
    created_at: copy.createdAt.toISOString(),
    updated_at: copy.updatedAt.toISOString(),
    variant: {
      id: copy.variant.id,
      name: copy.variant.name,
      collectible: {
        id: copy.variant.collectible.id,
        number: copy.variant.collectible.number,
        name: copy.variant.collectible.name,
        rarity: copy.variant.collectible.rarity,
        set_id: copy.variant.collectible.setId,
      },
    },
  };
}

const listQuerySchema = z.object({ setId: z.string().optional() });

collectionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { setId } = listQuerySchema.parse(req.query);
    const copies = await getUserCopies(userId(req), setId);
    res.json({ copies: copies.map(toPublicCopy) });
  }),
);

const createCopySchema = z.object({
  variantId: z.string().min(1),
  availability: z.enum(["KEEP", "TRADE", "SELL", "GIVE_AWAY"]).optional(),
  condition: z.string().trim().max(60).optional(),
});

collectionRouter.post(
  "/copies",
  asyncHandler(async (req, res) => {
    const body = createCopySchema.parse(req.body);

    const variant = await prisma.variant.findUnique({ where: { id: body.variantId } });
    if (!variant) {
      throw ApiError.badRequest("Unknown variant");
    }

    const copy = await prisma.userCopy.create({
      data: {
        ownerId: userId(req),
        variantId: body.variantId,
        availability: body.availability ?? "KEEP",
        condition: body.condition,
      },
      include: { variant: { include: { collectible: true } } },
    });

    res.status(201).json({ copy: toPublicCopy(copy) });
  }),
);

const updateCopySchema = z.object({
  availability: z.enum(["KEEP", "TRADE", "SELL", "GIVE_AWAY"]).optional(),
  condition: z.string().trim().max(60).nullable().optional(),
});

async function loadOwnedCopyOrNotFound(copyId: string, ownerId: string) {
  const copy = await prisma.userCopy.findUnique({
    where: { id: copyId },
    include: { variant: { include: { collectible: true } } },
  });
  // Return 404 (not 403) for copies owned by someone else, so a guessed id
  // cannot be used to distinguish "exists but not mine" from "doesn't exist".
  if (!copy || copy.ownerId !== ownerId) {
    throw ApiError.notFound("Copy not found");
  }
  return copy;
}

collectionRouter.patch(
  "/copies/:id",
  asyncHandler(async (req, res) => {
    const body = updateCopySchema.parse(req.body);
    await loadOwnedCopyOrNotFound(req.params.id, userId(req));

    const updated = await prisma.userCopy.update({
      where: { id: req.params.id },
      data: {
        ...(body.availability ? { availability: body.availability } : {}),
        ...(body.condition !== undefined ? { condition: body.condition } : {}),
      },
      include: { variant: { include: { collectible: true } } },
    });

    res.json({ copy: toPublicCopy(updated) });
  }),
);

collectionRouter.delete(
  "/copies/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedCopyOrNotFound(req.params.id, userId(req));
    await prisma.userCopy.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

const progressParamsSchema = z.object({ id: z.string().min(1) });

export const mySetsRouter = Router();
mySetsRouter.use(requireAuth);

mySetsRouter.get(
  "/:id/progress",
  asyncHandler(async (req, res) => {
    const { id } = progressParamsSchema.parse(req.params);
    const result = await computeSetProgressForUser(userId(req), id);

    res.json({
      set_id: result.setId,
      total_count: result.progress.totalCount,
      owned_count: result.progress.ownedCount,
      missing_count: result.progress.missingCount,
      duplicate_count: result.progress.duplicateCount,
      completion_percentage: result.progress.completionPercentage,
      checklist: result.checklist.map((entry) => ({
        collectible: {
          id: entry.collectible.id,
          number: entry.collectible.number,
          name: entry.collectible.name,
          rarity: entry.collectible.rarity,
          variants: entry.collectible.variants,
        },
        owned_quantity: entry.ownedQuantity,
        duplicate_quantity: entry.duplicateQuantity,
        is_owned: entry.isOwned,
      })),
    });
  }),
);
