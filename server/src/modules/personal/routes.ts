import { Router } from "express";
import { z } from "zod";
import { CONDITION_GRADES } from "../../domain/condition.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import {
  addWrittenCopy,
  correctWrittenCard,
  createWrittenCard,
  deleteWrittenCopy,
  listWrittenCards,
  toWrittenCard,
  updateWrittenCopy,
} from "./service.js";

export const personalRouter = Router();
personalRouter.use(requireAuth);

function userId(req: import("express").Request): string {
  return (req as AuthenticatedRequest).userId;
}

const availabilitySchema = z.enum(["KEEP", "TRADE", "SELL", "GIVE_AWAY"]);

const identitySchema = z.object({
  name: z.string(),
  game: z.string(),
  set_name: z.string(),
  number: z.string().nullable().optional(),
  no_number: z.boolean().optional(),
  set_code: z.string().nullable().optional(),
  rarity: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
});

const createSchema = identitySchema.extend({
  printing: z.string().nullable().optional(),
  availability: availabilitySchema,
  condition: z.enum(CONDITION_GRADES).nullable().optional(),
  add_copy: z.boolean().optional(),
  different_card: z.boolean().optional(),
  same_card_id: z.string().min(1).nullable().optional(),
});

function identityFrom(body: z.infer<typeof identitySchema>) {
  return {
    name: body.name,
    game: body.game,
    setName: body.set_name,
    number: body.number,
    noNumber: body.no_number === true,
    setCode: body.set_code,
    rarity: body.rarity,
    language: body.language,
  };
}

personalRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listWrittenCards(userId(req)));
  }),
);

personalRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const card = await createWrittenCard(userId(req), {
      ...identityFrom(body),
      printing: body.printing,
      availability: body.availability,
      condition: body.condition,
      addCopy: body.add_copy,
      differentCard: body.different_card,
      sameCardId: body.same_card_id,
    });
    res.status(201).json({ card: toWrittenCard(card) });
  }),
);

personalRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = identitySchema.parse(req.body);
    const card = await correctWrittenCard(userId(req), req.params.id, identityFrom(body));
    res.json({ card: toWrittenCard(card) });
  }),
);

const copySchema = z.object({
  availability: availabilitySchema.optional(),
  condition: z.enum(CONDITION_GRADES).nullable().optional(),
  printing: z.string().nullable().optional(),
});

personalRouter.post(
  "/:id/copies",
  asyncHandler(async (req, res) => {
    const body = copySchema.parse(req.body);
    const card = await addWrittenCopy(
      userId(req),
      req.params.id,
      body.availability ?? "KEEP",
      body.condition ?? null,
      body.printing,
    );
    res.status(201).json({ card: toWrittenCard(card) });
  }),
);

export const personalCopyRouter = Router();
personalCopyRouter.use(requireAuth);

personalCopyRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = copySchema.parse(req.body);
    const card = await updateWrittenCopy(userId(req), req.params.id, {
      availability: body.availability,
      condition: body.condition,
      printing: body.printing,
    });
    res.json({ card: toWrittenCard(card) });
  }),
);

personalCopyRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await deleteWrittenCopy(userId(req), req.params.id));
  }),
);
