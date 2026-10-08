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
      data: {
        setId: set.id,
        number: "ZQ-001",
        name: "Zephyr Compass",
        rarity: "Rare",
        metadata: JSON.stringify({ kind: "Object", ink: "Ember", note: "hidden-note" }),
      },
    });
    await prisma.collectible.create({
      data: {
        setId: set.id,
        number: "ZQ-002",
        name: "Old Zephyr",
        rarity: "Common",
        metadata: JSON.stringify({ kind: "place", ink: "Blue" }),
      },
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
    expect(byName.body.results[0]).not.toHaveProperty("owned_quantity");
    expect(byName.body.results[0]).not.toHaveProperty("metadata");
    expect(byName.body.results[0]).toMatchObject({ kind: "Object", ink: "Ember" });
    expect(JSON.stringify(byName.body)).not.toContain("hidden-note");
    expect(byName.body.results[0].defaultVariantId).toBeNull();

    const rejected = await request(app)
      .get("/api/catalog/search")
      .set("Authorization", "Bearer not-a-session")
      .query({ q: "zephyr compass" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.results[0]).not.toHaveProperty("owned_quantity");

    const bySet = await request(app)
      .get("/api/catalog/search")
      .query({ q: `zq-${stamp}` });
    expect(bySet.body.results.map((item: { name: string }) => item.name)).toEqual(["Zephyr Compass", "Old Zephyr"]);
    const oldZephyr = bySet.body.results.find((item: { name: string }) => item.name === "Old Zephyr");
    expect(oldZephyr).toMatchObject({ kind: null, ink: null });
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

  it("counts only the signed-in person's copies", async () => {
    const universe = await prisma.collectibleUniverse.create({
      data: { name: "Owned Search Universe", slug: `owned-search-${stamp}` },
    });
    const set = await prisma.set.create({
      data: { universeId: universe.id, name: "Sextant Shelf", code: `SX-${stamp}` },
    });
    const collectible = await prisma.collectible.create({
      data: { setId: set.id, number: "SX-001", name: "Quill Sextant", rarity: "Rare" },
    });
    const variant = await prisma.variant.create({
      data: { collectibleId: collectible.id, name: "Base", isDefault: true },
    });
    const owner = await request(app)
      .post("/api/auth/register")
      .set("X-Auth-Mode", "bearer")
      .send({ email: `search-owner-${stamp}@example.com`, password: "password123", displayName: "Search Owner" });
    const other = await request(app)
      .post("/api/auth/register")
      .set("X-Auth-Mode", "bearer")
      .send({ email: `search-other-${stamp}@example.com`, password: "password123", displayName: "Search Other" });
    expect(owner.status).toBe(201);
    expect(other.status).toBe(201);

    const none = await request(app)
      .get("/api/catalog/search")
      .set("Authorization", `Bearer ${owner.body.token}`)
      .query({ q: "quill sextant" });
    expect(none.body.results[0].owned_quantity).toBe(0);
    expect(none.body.results[0].defaultVariantId).toBe(variant.id);

    const kept = await request(app)
      .post("/api/my/collection/copies")
      .set("Authorization", `Bearer ${owner.body.token}`)
      .send({ variantId: variant.id, availability: "KEEP" });
    const offered = await request(app)
      .post("/api/my/collection/copies")
      .set("Authorization", `Bearer ${owner.body.token}`)
      .send({ variantId: variant.id, availability: "TRADE" });
    expect(kept.status).toBe(201);
    expect(offered.status).toBe(201);

    const owned = await request(app)
      .get("/api/catalog/search")
      .set("Authorization", `Bearer ${owner.body.token}`)
      .query({ q: "quill sextant" });
    expect(owned.status).toBe(200);
    expect(owned.body.results[0].owned_quantity).toBe(2);

    const stranger = await request(app)
      .get("/api/catalog/search")
      .set("Authorization", `Bearer ${other.body.token}`)
      .query({ q: "quill sextant" });
    expect(stranger.body.results[0].owned_quantity).toBe(0);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
