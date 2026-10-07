import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import type { ExchangeAction } from "../../domain/exchange.js";
import { actOnExchange, getExchangeForUser, listExchangesForUser, proposeExchange } from "./service.js";

export const exchangesRouter = Router();
exchangesRouter.use(requireAuth);

function userId(req: import("express").Request): string {
  return (req as AuthenticatedRequest).userId;
}

const proposeSchema = z.object({
  set_id: z.string().min(1).max(80),
  collector_ref: z.string().min(1).max(80),
  type: z.enum(["MUTUAL_TRADE", "DONATION"]),
});

exchangesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const exchanges = await listExchangesForUser(userId(req));
    res.json({ exchanges });
  }),
);

exchangesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = proposeSchema.parse(req.body);
    const exchange = await proposeExchange(userId(req), {
      setId: body.set_id,
      collectorRef: body.collector_ref,
      type: body.type,
    });
    res.status(201).json({ exchange });
  }),
);

exchangesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const exchange = await getExchangeForUser(userId(req), req.params.id);
    res.json({ exchange });
  }),
);

function postAction(action: ExchangeAction) {
  exchangesRouter.post(
    `/:id/${action}`,
    asyncHandler(async (req, res) => {
      const exchange = await actOnExchange(userId(req), req.params.id, action);
      res.json({ exchange });
    }),
  );
}

postAction("accept");
postAction("decline");
postAction("cancel");
postAction("confirm");
