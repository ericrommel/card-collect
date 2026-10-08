import { randomBytes } from "node:crypto";
import { prisma } from "../../db.js";
import { ApiError } from "../../middleware/apiError.js";
import { removeImageRows } from "../images/service.js";
import { unlinkImages } from "../images/store.js";

export const BULK_LIMIT = 200;

type Availability = "KEEP" | "TRADE" | "SELL" | "GIVE_AWAY";

function newCopyId(): string {
  return `copy_${randomBytes(12).toString("hex")}`;
}

export async function addCopiesForCollectibles(
  ownerId: string,
  setId: string,
  input: {
    collectibleIds: string[];
    availability: Availability;
    condition: string | null;
    mode: "add" | "ensure_one";
  },
): Promise<{ createdCount: number; skippedCount: number }> {
  if (input.collectibleIds.length > BULK_LIMIT) {
    throw ApiError.badRequest(`Choose at most ${BULK_LIMIT} cards at a time`);
  }

  const uniqueIds = [...new Set(input.collectibleIds)];

  return prisma.$transaction(
    async (tx) => {
      const set = await tx.set.findUnique({ where: { id: setId }, select: { id: true } });
      if (!set) throw ApiError.notFound("Set not found");

      const collectibles = await tx.collectible.findMany({
        where: { id: { in: uniqueIds }, setId },
        include: { variants: { where: { isDefault: true }, take: 1 } },
      });
      if (collectibles.length !== uniqueIds.length) {
        throw ApiError.badRequest("One or more cards are not in this set");
      }
      if (collectibles.some((collectible) => collectible.variants.length === 0)) {
        throw ApiError.badRequest("One or more cards have no default print");
      }

      const variantByCollectible = new Map(
        collectibles.map((collectible) => [collectible.id, collectible.variants[0].id]),
      );
      const owned = new Set<string>();
      if (input.mode === "ensure_one") {
        const existing = await tx.userCopy.findMany({
          where: { ownerId, variant: { collectibleId: { in: uniqueIds } } },
          select: { variant: { select: { collectibleId: true } } },
        });
        for (const copy of existing) owned.add(copy.variant.collectibleId);
      }

      const data: {
        id: string;
        ownerId: string;
        variantId: string;
        availability: Availability;
        condition: string | null;
      }[] = [];
      let skippedCount = 0;
      for (const collectibleId of input.collectibleIds) {
        if (input.mode === "ensure_one" && owned.has(collectibleId)) {
          skippedCount += 1;
          continue;
        }
        data.push({
          id: newCopyId(),
          ownerId,
          variantId: variantByCollectible.get(collectibleId)!,
          availability: input.availability,
          condition: input.condition,
        });
        if (input.mode === "ensure_one") owned.add(collectibleId);
      }

      if (data.length > 0) {
        await tx.userCopy.createMany({ data });
      }
      return { createdCount: data.length, skippedCount };
    },
    { timeout: 20_000 },
  );
}

function uniqueCopyIds(copyIds: string[]): string[] {
  const uniqueIds = [...new Set(copyIds)];
  if (uniqueIds.length !== copyIds.length) {
    throw ApiError.badRequest("The same copy was sent more than once");
  }
  return uniqueIds;
}

const RESERVED_MESSAGE =
  "One or more copies are reserved for an open exchange. Cancel that exchange before changing them.";

export async function updateCopiesBulk(
  ownerId: string,
  input: { copyIds: string[]; availability?: Availability; condition?: string | null },
): Promise<{ updatedCount: number }> {
  if (input.availability === undefined && input.condition === undefined) {
    throw ApiError.badRequest("Choose an availability or a condition to change");
  }
  const ids = uniqueCopyIds(input.copyIds);
  return prisma.$transaction(async (tx) => {
    const copies = await tx.userCopy.findMany({
      where: { id: { in: ids }, ownerId },
      select: { id: true, reservedByExchangeId: true },
    });
    if (copies.length !== ids.length) throw ApiError.notFound("One or more copies were not found");
    if (copies.some((copy) => copy.reservedByExchangeId != null)) throw ApiError.conflict(RESERVED_MESSAGE);

    const result = await tx.userCopy.updateMany({
      where: { id: { in: ids }, ownerId, reservedByExchangeId: null },
      data: {
        ...(input.availability ? { availability: input.availability } : {}),
        ...(input.condition !== undefined ? { condition: input.condition } : {}),
      },
    });
    if (result.count !== ids.length) throw ApiError.conflict(RESERVED_MESSAGE);
    return { updatedCount: result.count };
  });
}

export async function deleteCopiesBulk(ownerId: string, copyIds: string[]): Promise<{ deletedCount: number }> {
  const ids = uniqueCopyIds(copyIds);
  const outcome = await prisma.$transaction(async (tx) => {
    const copies = await tx.userCopy.findMany({
      where: { id: { in: ids }, ownerId },
      select: { id: true, reservedByExchangeId: true },
    });
    if (copies.length !== ids.length) throw ApiError.notFound("One or more copies were not found");
    if (copies.some((copy) => copy.reservedByExchangeId != null)) throw ApiError.conflict(RESERVED_MESSAGE);

    const removedImageIds = await removeImageRows(tx, ids);
    const result = await tx.userCopy.deleteMany({
      where: { id: { in: ids }, ownerId, reservedByExchangeId: null },
    });
    if (result.count !== ids.length) throw ApiError.conflict(RESERVED_MESSAGE);
    return { deletedCount: result.count, removedImageIds };
  });
  await unlinkImages(outcome.removedImageIds);
  return { deletedCount: outcome.deletedCount };
}
