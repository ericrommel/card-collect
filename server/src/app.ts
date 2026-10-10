import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./modules/auth/routes.js";
import { catalogRouter } from "./modules/catalog/routes.js";
import { collectionRouter, mySetsRouter } from "./modules/collection/routes.js";
import { matchesRouter } from "./modules/matching/routes.js";
import { exchangesRouter } from "./modules/exchanges/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { mySharingRouter } from "./modules/sharing/routes.js";
import { publicSharingRouter } from "./modules/sharing/publicRoutes.js";
import { imageRouter } from "./modules/images/routes.js";
import { personalCopyRouter, personalRouter } from "./modules/personal/routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  // The API does not serve the web app. These headers apply to JSON responses.
  // trust proxy stays off so req.ip is the socket address, not X-Forwarded-For.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/my/collection", collectionRouter);
  app.use("/api/my/collection", imageRouter);
  app.use("/api/my/sets", mySetsRouter);
  app.use("/api/my/dashboard", dashboardRouter);
  app.use("/api/my/sets", mySharingRouter);
  app.use("/api/my/matches", matchesRouter);
  app.use("/api/my/exchanges", exchangesRouter);
  app.use("/api/my/personal-cards", personalRouter);
  app.use("/api/my/personal-copies", personalCopyRouter);
  app.use("/api/public/collections", publicSharingRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);

  return app;
}
