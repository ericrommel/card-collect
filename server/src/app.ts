import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./modules/auth/routes.js";
import { catalogRouter } from "./modules/catalog/routes.js";
import { collectionRouter, mySetsRouter } from "./modules/collection/routes.js";
import { matchesRouter } from "./modules/matching/routes.js";
import { mySharingRouter } from "./modules/sharing/routes.js";
import { publicSharingRouter } from "./modules/sharing/publicRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/my/collection", collectionRouter);
  app.use("/api/my/sets", mySetsRouter);
  app.use("/api/my/sets", mySharingRouter);
  app.use("/api/my/matches", matchesRouter);
  app.use("/api/public/collections", publicSharingRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);

  return app;
}
