import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { catalogSearchHitWindow } from "../../src/modules/catalog/routes.js";

const app = createApp();

afterAll(async () => {
  delete process.env.CATALOG_SEARCH_RATE_LIMIT;
  catalogSearchHitWindow.clear();
  await prisma.$disconnect();
});

describe("catalog search rate limit", () => {
  it("returns 429 after too many searches from one address and still opens a set", async () => {
    process.env.CATALOG_SEARCH_RATE_LIMIT = "2";
    catalogSearchHitWindow.clear();

    const send = (q: string, forwardedFor?: string) => {
      const req = request(app).get("/api/catalog/search").query({ q });
      if (forwardedFor) req.set("X-Forwarded-For", forwardedFor);
      return req;
    };

    const tooLong = await send("a".repeat(81));
    expect(tooLong.status).toBe(400);

    const short = await send("a");
    expect(short.status).toBe(200);
    expect(short.body.results).toEqual([]);

    const blocked = await send("harbor");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    expect(blocked.body.error).toBe("Too many searches. Wait a minute and try again.");
    expect(blocked.body.results).toBeUndefined();

    const spoofed = await send("harbor", "203.0.113.50");
    expect(spoofed.status).toBe(429);

    const sets = await request(app).get("/api/catalog/sets");
    expect(sets.status).toBe(200);
    expect(Array.isArray(sets.body.sets)).toBe(true);

    const checklist = await request(app).get("/api/catalog/sets/not-a-set/collectibles");
    expect(checklist.status).toBe(404);
    expect(checklist.body.error).toBe("Set not found");

    delete process.env.CATALOG_SEARCH_RATE_LIMIT;
    catalogSearchHitWindow.clear();
  });
});
