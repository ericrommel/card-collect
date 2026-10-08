import type { Request, Response } from "express";
import { env } from "../../env.js";
import { TOKEN_TTL_SECONDS } from "./jwt.js";

export const SESSION_COOKIE = "cards_collect_session";

function baseOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(), maxAge: TOKEN_TTL_SECONDS * 1000 });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, baseOptions());
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Cookie-authenticated browser requests must come from the configured
 * app origin. Outside production, any localhost port is allowed so the
 * Vite dev server can move off 5173 without becoming a CSRF hole.
 *
 * A missing Origin is treated as allowed here so safe reads (and tools
 * that do not send Origin) still work. State-changing requests use
 * isAllowedMutationOrigin, which rejects a missing Origin.
 */
export function isAllowedBrowserOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin === env.corsOrigin) return true;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Login, logout, and cookie-authenticated writes must name an allowed origin. */
export function isAllowedMutationOrigin(origin: string | undefined): boolean {
  return Boolean(origin) && isAllowedBrowserOrigin(origin);
}
