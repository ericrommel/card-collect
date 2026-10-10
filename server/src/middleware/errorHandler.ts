import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "./apiError.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, ...err.extra });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.flatten() });
    return;
  }
  // express.json rejects a body it cannot parse. That is the client's mistake.
  if (err instanceof SyntaxError && "status" in err && err.status === 400) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (typeof err === "object" && err !== null && "status" in err && err.status === 413) {
    res.status(413).json({ error: "That image is too large. Use a photo under 5 MB." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
