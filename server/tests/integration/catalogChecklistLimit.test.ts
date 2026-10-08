import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { catalogChecklistHitWindow, catalogSearchHitWindow } from "../../src/modules/catalog/routes.js";

const app = createApp();

let universeId = "";
let setId = "";
let collectibleId = "";
let variantId = "";

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const universe = await prisma.collectibleUniverse.create({
    data: { name: "Checklist Limit", slug: `checklist-limit-${stamp}` },
  });
  universeId = universe.id;
  const set = await prisma.set.create({
    data: { universeId: universe.id, name: "Checklist Harbor", code: `CL-${stamp}` },
  });
  setId = set.id;
  const collectible = await prisma.collectible.create({
    data: { setId: set.id, number: "CL-001", name: "Checklist Keeper", rarity: "Common" },
  });
  collectibleId = collectible.id;
  const variant = await prisma.variant.create({
    data: { collectibleId: collectible.id, name: "Base", isDefault: true },
  });
  variantId = variant.id;
});

afterAll(async () => {
  delete process.env.CATALOG_CHECKLIST_RATE_LIMIT;
  delete process.env.CATALOG_SEARCH_RATE_LIMIT;
  catalogChecklistHitWindow.clear();
  catalogSearchHitWindow.clear();
  if (variantId) await prisma.variant.delete({ where: { id: variantId } });
  if (collectibleId) await prisma.collectible.delete({ where: { id: collectibleId } });
  if (setId) await prisma.set.delete({ where: { id: setId } });
  if (universeId) await prisma.collectibleUniverse.delete({ where: { id: universeId } });
  await prisma.$disconnect();
});

describe("catalog checklist rate limit", () => {
  it("returns 429 after too many set loads and does not spend the search budget", async () => {
    process.env.CATALOG_CHECKLIST_RATE_LIMIT = "2";
    process.env.CATALOG_SEARCH_RATE_LIMIT = "1";
    catalogChecklistHitWindow.clear();
    catalogSearchHitWindow.clear();

    const loaded = await request(app).get(`/api/catalog/sets/${setId}/collectibles`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.collectibles).toEqual([
      expect.objectContaining({ id: collectibleId, number: "CL-001", name: "Checklist Keeper" }),
    ]);

    const missing = await request(app).get("/api/catalog/sets/not-a-set/collectibles");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("Set not found");

    const blocked = await request(app).get(`/api/catalog/sets/${setId}/collectibles`);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    expect(blocked.body.error).toBe("Too many set loads. Wait a minute and try again.");
    expect(blocked.body.collectibles).toBeUndefined();

    const spoofed = await request(app)
      .get(`/api/catalog/sets/${setId}/collectibles`)
      .set("X-Forwarded-For", "203.0.113.50");
    expect(spoofed.status).toBe(429);

    const sets = await request(app).get("/api/catalog/sets");
    expect(sets.status).toBe(200);
    expect(sets.body.sets.some((set: { id: string }) => set.id === setId)).toBe(true);

    const details = await request(app).get(`/api/catalog/sets/${setId}`);
    expect(details.status).toBe(200);
    expect(details.body.set.id).toBe(setId);

    const missingDetails = await request(app).get("/api/catalog/sets/not-a-set");
    expect(missingDetails.status).toBe(404);

    const search = await request(app).get("/api/catalog/search").query({ q: "Checklist Keeper" });
    expect(search.status).toBe(200);
    expect(search.body.results.map((hit: { number: string }) => hit.number)).toContain("CL-001");

    const searchBlocked = await request(app).get("/api/catalog/search").query({ q: "Checklist Keeper" });
    expect(searchBlocked.status).toBe(429);
    expect(searchBlocked.body.error).toBe("Too many searches. Wait a minute and try again.");

    delete process.env.CATALOG_CHECKLIST_RATE_LIMIT;
    delete process.env.CATALOG_SEARCH_RATE_LIMIT;
    catalogChecklistHitWindow.clear();
    catalogSearchHitWindow.clear();
  });
});
