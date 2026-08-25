import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "./apiError.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.flatten() });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
