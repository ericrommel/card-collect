import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { ApiError } from "../../middleware/apiError.js";
import { prepareCardPhoto, type PhotoContentType } from "./preparePhoto.js";
import { readStoredImage, unlinkImages, writeStoredImage } from "./store.js";

type Db = Prisma.TransactionClient | typeof prisma;

export const MAX_PHOTOS_PER_USER = 200;
export const PHOTO_CAP = `You can keep up to ${MAX_PHOTOS_PER_USER} photos. Remove one before adding another.`;

export type ImageSide = "FRONT" | "BACK";

export function parseImageSide(value: string): ImageSide {
  if (value === "front") return "FRONT";
  if (value === "back") return "BACK";
  throw ApiError.badRequest("Choose the front or the back of the card.");
}

export function imageFlagsFor(
  rows: { copyId: string; side: string }[],
): Map<string, { front: boolean; back: boolean }> {
  const flags = new Map<string, { front: boolean; back: boolean }>();
  for (const row of rows) {
    const current = flags.get(row.copyId) ?? { front: false, back: false };
    if (row.side === "FRONT") current.front = true;
    if (row.side === "BACK") current.back = true;
    flags.set(row.copyId, current);
  }
  return flags;
}

export async function loadImageFlags(copyIds: string[]): Promise<Map<string, { front: boolean; back: boolean }>> {
  if (copyIds.length === 0) return new Map();
  const rows = await prisma.copyImage.findMany({
    where: { copyId: { in: copyIds } },
    select: { copyId: true, side: true },
  });
  return imageFlagsFor(rows);
}

export async function saveCopyPhoto(
  ownerId: string,
  copyId: string,
  side: ImageSide,
  input: Buffer,
): Promise<{ side: "front" | "back"; contentType: PhotoContentType }> {
  const prepared = prepareCardPhoto(input);
  const existing = await prisma.copyImage.findUnique({ where: { copyId_side: { copyId, side } } });
  if (existing) {
    await writeStoredImage(existing.id, prepared.bytes);
    await prisma.copyImage.update({
      where: { id: existing.id },
      data: { contentType: prepared.contentType, byteLength: prepared.bytes.length },
    });
  } else {
    const count = await prisma.copyImage.count({ where: { ownerId } });
    if (count >= MAX_PHOTOS_PER_USER) throw ApiError.conflict(PHOTO_CAP);
    const record = await prisma.copyImage.create({
      data: {
        ownerId,
        copyId,
        side,
        contentType: prepared.contentType,
        byteLength: prepared.bytes.length,
      },
    });
    try {
      await writeStoredImage(record.id, prepared.bytes);
    } catch (error) {
      await prisma.copyImage.delete({ where: { id: record.id } }).catch(() => undefined);
      throw error;
    }
  }

  return { side: side === "FRONT" ? "front" : "back", contentType: prepared.contentType };
}

export async function readCopyPhoto(
  ownerId: string,
  copyId: string,
  side: ImageSide,
): Promise<{ bytes: Buffer; contentType: string }> {
  const row = await prisma.copyImage.findUnique({ where: { copyId_side: { copyId, side } } });
  if (!row || row.ownerId !== ownerId) throw ApiError.notFound("Photo not found");
  try {
    const bytes = await readStoredImage(row.id);
    return { bytes, contentType: row.contentType };
  } catch {
    throw ApiError.notFound("Photo not found");
  }
}

export async function deleteCopyPhoto(ownerId: string, copyId: string, side: ImageSide): Promise<void> {
  const row = await prisma.copyImage.findUnique({ where: { copyId_side: { copyId, side } } });
  if (!row || row.ownerId !== ownerId) throw ApiError.notFound("Photo not found");
  await prisma.copyImage.delete({ where: { id: row.id } });
  await unlinkImages([row.id]);
}

/** Removes image rows inside the caller's transaction. Unlink the files only after it commits. */
export async function removeImageRows(db: Db, copyIds: string[]): Promise<string[]> {
  if (copyIds.length === 0) return [];
  const rows = await db.copyImage.findMany({
    where: { copyId: { in: copyIds } },
    select: { id: true },
  });
  if (rows.length === 0) return [];
  await db.copyImage.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
  return rows.map((row) => row.id);
}
