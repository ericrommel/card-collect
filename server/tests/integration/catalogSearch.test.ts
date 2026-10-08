import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();
const stamp = Date.now();

describe("catalog search", () => {
  it("finds a card by name or set and does not return a one-letter query", async () => {
    const universe = await prisma.collectibleUniverse.create({
      data: { name: "Search Universe", slug: `search-universe-${stamp}` },
    });
    const set = await prisma.set.create({
      data: { universeId: universe.id, name: "Zephyr Market", code: `ZQ-${stamp}` },
    });
    await prisma.collectible.create({
      data: { setId: set.id, number: "ZQ-001", name: "Zephyr Compass", rarity: "Rare" },
    });
    await prisma.collectible.create({
      data: { setId: set.id, number: "ZQ-002", name: "Old Zephyr", rarity: "Common" },
    });

    const byName = await request(app).get("/api/catalog/search").query({ q: "zephyr compass" });
    expect(byName.status).toBe(200);
    expect(byName.body.results).toEqual([
      expect.objectContaining({
        name: "Zephyr Compass",
        number: "ZQ-001",
        universeName: "Search Universe",
        set: expect.objectContaining({ code: `ZQ-${stamp}`, name: "Zephyr Market" }),
      }),
    ]);
    expect(JSON.stringify(byName.body)).not.toContain("email");

    const bySet = await request(app)
      .get("/api/catalog/search")
      .query({ q: `zq-${stamp}` });
    expect(bySet.body.results.map((item: { name: string }) => item.name)).toEqual(["Zephyr Compass", "Old Zephyr"]);
    expect(bySet.body.truncated).toBe(false);

    const short = await request(app).get("/api/catalog/search").query({ q: "z" });
    expect(short.status).toBe(200);
    expect(short.body).toEqual({ results: [], truncated: false });

    const huge = await request(app)
      .get("/api/catalog/search")
      .query({ q: "z".repeat(81) });
    expect(huge.status).toBe(400);
    expect(huge.body.error).toBe("Invalid request");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
