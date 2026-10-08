import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import { createHitWindow } from "../../lib/hitWindow.js";
import { MAX_PHOTO_BYTES, prepareCardPhoto } from "./preparePhoto.js";
import { deleteCopyPhoto, parseImageSide, readCopyPhoto, saveCopyPhoto } from "./service.js";
import {
  getCardIdentifier,
  IDENTIFY_CANDIDATES_MESSAGE,
  IDENTIFY_UNAVAILABLE_MESSAGE,
  type IdentificationCandidate,
} from "../identification/cardIdentifier.js";

export const imageRouter = Router();
imageRouter.use(requireAuth);

const uploadWindow = createHitWindow(60_000);
const identifyWindow = createHitWindow(60_000);

function attemptLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return fallback;
}

function limitUploads(req: express.Request, res: express.Response, next: express.NextFunction) {
  const userId = (req as AuthenticatedRequest).userId;
  if (uploadWindow.tooMany(userId, attemptLimit("IMAGE_RATE_LIMIT", 30))) {
    res.setHeader("Retry-After", "60");
    throw ApiError.tooManyRequests("Too many photos. Wait a minute and try again.");
  }
  next();
}

function limitIdentify(req: express.Request, res: express.Response, next: express.NextFunction) {
  const userId = (req as AuthenticatedRequest).userId;
  if (identifyWindow.tooMany(userId, attemptLimit("IDENTIFY_RATE_LIMIT", 20))) {
    res.setHeader("Retry-After", "60");
    throw ApiError.tooManyRequests("Too many recognition attempts. Wait a minute and try again.");
  }
  next();
}

function photoParser() {
  return express.raw({
    limit: MAX_PHOTO_BYTES,
    type: (req) => {
      const header = req.headers["content-type"];
      if (typeof header !== "string") return false;
      const type = header.split(";")[0]?.trim().toLowerCase();
      return type === "image/jpeg" || type === "image/jpg" || type === "image/png";
    },
  });
}

async function ownedCopyId(copyId: string, ownerId: string): Promise<void> {
  const copy = await prisma.userCopy.findUnique({ where: { id: copyId }, select: { ownerId: true } });
  if (!copy || copy.ownerId !== ownerId) throw ApiError.notFound("Copy not found");
}

const candidateSchema = z
  .object({
    set_code: z.string().trim().min(1).max(40),
    number: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(120),
    confidence: z.number().min(0).max(1),
  })
  .strict();

imageRouter.post(
  "/identify",
  limitIdentify,
  photoParser(),
  asyncHandler(async (req, res) => {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const prepared = prepareCardPhoto(bytes);
    let result;
    try {
      result = await getCardIdentifier().identify(prepared.bytes, prepared.contentType);
    } catch (error) {
      console.error(error);
      result = { status: "unavailable" as const, candidates: [], message: IDENTIFY_UNAVAILABLE_MESSAGE };
    }

    const candidates: IdentificationCandidate[] = [];
    if (result.status === "candidates") {
      for (const candidate of result.candidates.slice(0, 8)) {
        const parsed = candidateSchema.safeParse(candidate);
        if (parsed.success) candidates.push(parsed.data);
      }
    }
    if (candidates.length === 0) {
      res.json({ status: "unavailable", candidates: [], message: IDENTIFY_UNAVAILABLE_MESSAGE });
      return;
    }
    res.json({ status: "candidates", candidates, message: IDENTIFY_CANDIDATES_MESSAGE });
  }),
);

imageRouter.post(
  "/copies/:id/images/:side",
  limitUploads,
  photoParser(),
  asyncHandler(async (req, res) => {
    const ownerId = (req as AuthenticatedRequest).userId;
    await ownedCopyId(req.params.id, ownerId);
    const side = parseImageSide(req.params.side);
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const image = await saveCopyPhoto(ownerId, req.params.id, side, bytes);
    res.status(201).json({ image: { side: image.side, content_type: image.contentType } });
  }),
);

imageRouter.get(
  "/copies/:id/images/:side",
  asyncHandler(async (req, res) => {
    const ownerId = (req as AuthenticatedRequest).userId;
    await ownedCopyId(req.params.id, ownerId);
    const photo = await readCopyPhoto(ownerId, req.params.id, parseImageSide(req.params.side));
    res.setHeader("Content-Type", photo.contentType);
    res.setHeader("Content-Length", String(photo.bytes.length));
    res.send(photo.bytes);
  }),
);

imageRouter.delete(
  "/copies/:id/images/:side",
  asyncHandler(async (req, res) => {
    const ownerId = (req as AuthenticatedRequest).userId;
    await ownedCopyId(req.params.id, ownerId);
    await deleteCopyPhoto(ownerId, req.params.id, parseImageSide(req.params.side));
    res.status(204).send();
  }),
);
