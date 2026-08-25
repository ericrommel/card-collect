import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();

let variantId: string;

async function registerUser(email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123", displayName: email.split("@")[0] });
  expect(res.status).toBe(201);
  return res.body.token as string;
}

beforeAll(async () => {
  const universe = await prisma.collectibleUniverse.create({
    data: { name: "Test Universe", slug: `test-universe-${Date.now()}` },
  });
  const set = await prisma.set.create({
    data: { universeId: universe.id, name: "Test Set", code: `TS-${Date.now()}` },
  });
  const collectible = await prisma.collectible.create({
    data: { setId: set.id, number: "T-001", name: "Test Card" },
  });
  const variant = await prisma.variant.create({
    data: { collectibleId: collectible.id, name: "Base", isDefault: true },
  });
  variantId = variant.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("authorization", () => {
  it("rejects unauthenticated requests to protected routes", async () => {
    const res = await request(app).get("/api/my/collection");
    expect(res.status).toBe(401);
  });

  it("prevents one user from mutating another user's copy by guessing its id", async () => {
    const tokenA = await registerUser(`owner-${Date.now()}@example.com`);
    const tokenB = await registerUser(`intruder-${Date.now()}@example.com`);

    const createRes = await request(app)
      .post("/api/my/collection/copies")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ variantId, availability: "KEEP" });
    expect(createRes.status).toBe(201);
    const copyId = createRes.body.copy.id as string;

    const patchAsIntruder = await request(app)
      .patch(`/api/my/collection/copies/${copyId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ availability: "TRADE" });
    expect(patchAsIntruder.status).toBe(404);

    const deleteAsIntruder = await request(app)
      .delete(`/api/my/collection/copies/${copyId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsIntruder.status).toBe(404);

    // The owner can still mutate it normally.
    const patchAsOwner = await request(app)
      .patch(`/api/my/collection/copies/${copyId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ availability: "TRADE" });
    expect(patchAsOwner.status).toBe(200);
    expect(patchAsOwner.body.copy.availability).toBe("TRADE");
  });

  it("does not leak one user's copies into another user's collection listing", async () => {
    const tokenA = await registerUser(`ownerlist-${Date.now()}@example.com`);
    const tokenB = await registerUser(`otherlist-${Date.now()}@example.com`);

    await request(app).post("/api/my/collection/copies").set("Authorization", `Bearer ${tokenA}`).send({ variantId });

    const listAsB = await request(app).get("/api/my/collection").set("Authorization", `Bearer ${tokenB}`);
    expect(listAsB.status).toBe(200);
    expect(listAsB.body.copies).toHaveLength(0);
  });

  it("never returns another user's email through the register/login response", async () => {
    const email = `selfonly-${Date.now()}@example.com`;
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", displayName: "Self Only" });
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });
});
