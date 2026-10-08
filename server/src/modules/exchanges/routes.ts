import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ApiError } from "../../middleware/apiError.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/requireAuth.js";
import { createHitWindow } from "../../lib/hitWindow.js";
import type { ExchangeAction } from "../../domain/exchange.js";
import { actOnExchange, getExchangeForUser, listExchangesForUser, proposeExchange } from "./service.js";

export const exchangesRouter = Router();
exchangesRouter.use(requireAuth);

function userId(req: import("express").Request): string {
  return (req as AuthenticatedRequest).userId;
}

const proposeHitWindow = createHitWindow(60_000);

function proposeAttemptLimit(): number {
  if (process.env.PROPOSE_RATE_LIMIT) {
    const parsed = Number(process.env.PROPOSE_RATE_LIMIT);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return 30;
}

function limitProposals(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  if (proposeHitWindow.tooMany(userId(req), proposeAttemptLimit())) {
    res.setHeader("Retry-After", "60");
    throw ApiError.tooManyRequests("Too many proposals. Wait a minute and try again.");
  }
  next();
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
  limitProposals,
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
