import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();

let setId: string;
let otherSetId: string;
let collectibleIds: string[];
let outsideCollectibleId: string;

async function register(email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .set("X-Auth-Mode", "bearer")
    .send({ email, password: "password123", displayName: email.split("@")[0] });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, id: res.body.user.id as string, email: res.body.user.email as string };
}

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const universe = await prisma.collectibleUniverse.create({
    data: { name: "Bulk Universe", slug: `bulk-universe-${stamp}` },
  });
  const set = await prisma.set.create({
    data: { universeId: universe.id, name: "Bulk Set", code: `BULK-${stamp}` },
  });
  const other = await prisma.set.create({
    data: { universeId: universe.id, name: "Other Set", code: `BULK-OTHER-${stamp}` },
  });
  setId = set.id;
  otherSetId = other.id;

  const created = [];
  for (const number of ["B-001", "B-002", "B-003"]) {
    const collectible = await prisma.collectible.create({
      data: {
        setId: set.id,
        number,
        name: `Bulk ${number}`,
        rarity: "Common",
        metadata: JSON.stringify({ kind: "Place", ink: "Sea" }),
      },
    });
    await prisma.variant.create({ data: { collectibleId: collectible.id, name: "Base", isDefault: true } });
    created.push(collectible.id);
  }
  collectibleIds = created;

  const outsider = await prisma.collectible.create({
    data: { setId: other.id, number: "O-001", name: "Outside" },
  });
  await prisma.variant.create({ data: { collectibleId: outsider.id, name: "Base", isDefault: true } });
  outsideCollectibleId = outsider.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bulk collection changes", () => {
  it("requires authentication", async () => {
    const res = await request(app)
      .post(`/api/my/sets/${setId}/copies`)
      .send({ collectible_ids: [collectibleIds[0]] });
    expect(res.status).toBe(401);
  });

  it("adds many cards once, then refuses cards from another set", async () => {
    const owner = await register(`bulk-owner-${Date.now()}@example.com`);
    const auth = { Authorization: `Bearer ${owner.token}` };

    const first = await request(app)
      .post(`/api/my/sets/${setId}/copies`)
      .set(auth)
      .send({ collectible_ids: [collectibleIds[0], collectibleIds[1]], mode: "ensure_one", condition: "Near Mint" });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ created_count: 2, skipped_count: 0 });

    const again = await request(app)
      .post(`/api/my/sets/${setId}/copies`)
      .set(auth)
      .send({ collectible_ids: [collectibleIds[0], collectibleIds[1]], mode: "ensure_one" });
    expect(again.status).toBe(201);
    expect(again.body).toEqual({ created_count: 0, skipped_count: 2 });

    const extra = await request(app)
      .post(`/api/my/sets/${setId}/copies`)
      .set(auth)
      .send({ collectible_ids: [collectibleIds[0]], mode: "add", availability: "TRADE", condition: "Good" });
    expect(extra.status).toBe(201);
    expect(extra.body.created_count).toBe(1);

    const listed = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.copies).toHaveLength(3);
    const trade = listed.body.copies.find((copy: { availability: string }) => copy.availability === "TRADE");
    expect(trade.condition).toBe("Good");

    const foreign = await request(app)
      .post(`/api/my/sets/${setId}/copies`)
      .set(auth)
      .send({ collectible_ids: [outsideCollectibleId] });
    expect(foreign.status).toBe(400);

    const missingSet = await request(app)
      .post("/api/my/sets/missing-set/copies")
      .set(auth)
      .send({ collectible_ids: [collectibleIds[0]] });
    expect(missingSet.status).toBe(404);

    const progress = await request(app).get(`/api/my/sets/${setId}/progress`).set(auth);
    expect(progress.status).toBe(200);
    expect(progress.body.owned_count).toBe(2);
    expect(progress.body.checklist[0].collectible.metadata).toEqual({ kind: "Place", ink: "Sea" });
  });

  it("updates and deletes only the caller's free copies, as one batch", async () => {
    const owner = await register(`bulk-edit-${Date.now()}@example.com`);
    const other = await register(`bulk-other-${Date.now()}@example.com`);
    const auth = { Authorization: `Bearer ${owner.token}` };

    await request(app)
      .post(`/api/my/sets/${setId}/copies`)
      .set(auth)
      .send({ collectible_ids: collectibleIds, mode: "ensure_one" });
    await request(app)
      .post(`/api/my/sets/${otherSetId}/copies`)
      .set({ Authorization: `Bearer ${other.token}` })
      .send({ collectible_ids: [outsideCollectibleId], mode: "add" });

    const mine = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth);
    const copyIds = mine.body.copies.map((copy: { id: string }) => copy.id) as string[];
    expect(copyIds).toHaveLength(3);

    const theirs = await request(app)
      .get("/api/my/collection")
      .set({ Authorization: `Bearer ${other.token}` });
    const theirId = theirs.body.copies[0].id as string;

    const mixed = await request(app)
      .patch("/api/my/collection/copies/bulk")
      .set(auth)
      .send({ copy_ids: [copyIds[0], theirId], availability: "SELL" });
    expect(mixed.status).toBe(404);
    const afterMixed = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth);
    expect(afterMixed.body.copies.every((copy: { availability: string }) => copy.availability === "KEEP")).toBe(true);

    const updated = await request(app)
      .patch("/api/my/collection/copies/bulk")
      .set(auth)
      .send({ copy_ids: copyIds, availability: "TRADE", condition: "Played" });
    expect(updated.status).toBe(200);
    expect(updated.body.updated_count).toBe(3);

    const exchange = await prisma.exchange.create({
      data: {
        type: "MUTUAL_TRADE",
        status: "PROPOSED",
        setId,
        proposerId: owner.id,
        counterpartyId: other.id,
      },
    });
    await prisma.userCopy.update({ where: { id: copyIds[0] }, data: { reservedByExchangeId: exchange.id } });

    const blocked = await request(app)
      .patch("/api/my/collection/copies/bulk")
      .set(auth)
      .send({ copy_ids: copyIds, availability: "SELL" });
    expect(blocked.status).toBe(409);
    const afterBlock = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth);
    expect(afterBlock.body.copies.every((copy: { availability: string }) => copy.availability === "TRADE")).toBe(true);

    const blockedDelete = await request(app)
      .delete("/api/my/collection/copies/bulk")
      .set(auth)
      .send({ copy_ids: copyIds });
    expect(blockedDelete.status).toBe(409);
    expect((await request(app).get(`/api/my/collection?setId=${setId}`).set(auth)).body.copies).toHaveLength(3);

    const removed = await request(app)
      .delete("/api/my/collection/copies/bulk")
      .set(auth)
      .send({ copy_ids: [copyIds[1], copyIds[2]] });
    expect(removed.status).toBe(200);
    expect(removed.body.deleted_count).toBe(2);
    expect((await request(app).get(`/api/my/collection?setId=${setId}`).set(auth)).body.copies).toHaveLength(1);
  });

  it("rejects an empty change and a batch that is too large", async () => {
    const owner = await register(`bulk-limit-${Date.now()}@example.com`);
    const auth = { Authorization: `Bearer ${owner.token}` };
    const empty = await request(app)
      .patch("/api/my/collection/copies/bulk")
      .set(auth)
      .send({ copy_ids: ["copy-1"] });
    expect(empty.status).toBe(400);

    const tooMany = await request(app)
      .post(`/api/my/sets/${setId}/copies`)
      .set(auth)
      .send({ collectible_ids: Array.from({ length: 201 }, () => collectibleIds[0]) });
    expect(tooMany.status).toBe(400);
  });
});

describe("collector dashboard", () => {
  it("summarizes only the caller's copies and does not require a started set for the catalog", async () => {
    const owner = await register(`dash-${Date.now()}@example.com`);
    const other = await register(`dash-other-${Date.now()}@example.com`);

    await request(app)
      .post(`/api/my/sets/${setId}/copies`)
      .set({ Authorization: `Bearer ${owner.token}` })
      .send({ collectible_ids: [collectibleIds[0]], mode: "ensure_one", availability: "KEEP" });

    const anon = await request(app).get("/api/my/dashboard");
    expect(anon.status).toBe(401);

    const mine = await request(app)
      .get("/api/my/dashboard")
      .set({ Authorization: `Bearer ${owner.token}` });
    expect(mine.status).toBe(200);
    const mineSet = mine.body.sets.find((set: { id: string }) => set.id === setId);
    expect(mineSet.owned_count).toBe(1);
    expect(mineSet.missing_count).toBe(2);
    expect(mineSet.total_count).toBe(3);
    expect(mineSet.copy_count).toBe(1);
    expect(mine.body.recent_copies.map((copy: { collectible_number: string }) => copy.collectible_number)).toContain(
      "B-001",
    );
    const recent = mine.body.recent_copies.find(
      (copy: { collectible_number: string }) => copy.collectible_number === "B-001",
    );
    expect(recent).toMatchObject({ kind: "Place", ink: "Sea", rarity: "Common" });
    expect(recent).not.toHaveProperty("metadata");
    expect(mineSet.preview).toMatchObject({ number: "B-001", name: "Bulk B-001", kind: "Place", ink: "Sea" });
    expect(mineSet.preview).not.toHaveProperty("metadata");

    const later = await register(`dash-later-${Date.now()}@example.com`);
    await request(app)
      .post(`/api/my/sets/${setId}/copies`)
      .set({ Authorization: `Bearer ${later.token}` })
      .send({ collectible_ids: [collectibleIds[2]], mode: "ensure_one", availability: "KEEP" });
    const laterDash = await request(app)
      .get("/api/my/dashboard")
      .set({ Authorization: `Bearer ${later.token}` });
    const laterSet = laterDash.body.sets.find((set: { id: string }) => set.id === setId);
    expect(laterSet.preview).toMatchObject({ number: "B-003", kind: "Place", ink: "Sea" });
    expect(laterSet.preview).not.toHaveProperty("metadata");
    expect(JSON.stringify(mine.body)).not.toContain(other.email);
    expect(JSON.stringify(mine.body)).not.toContain(owner.email);

    const theirs = await request(app)
      .get("/api/my/dashboard")
      .set({ Authorization: `Bearer ${other.token}` });
    const theirSet = theirs.body.sets.find((set: { id: string }) => set.id === setId);
    expect(theirSet.owned_count).toBe(0);
    expect(theirSet.missing_count).toBe(3);
    expect(theirSet.preview).toMatchObject({ number: "B-001", kind: "Place", ink: "Sea" });
    expect(theirSet.preview).not.toHaveProperty("metadata");
    expect(theirs.body.recent_copies).toEqual([]);
    expect(theirs.body.highlights.trades).toEqual([]);
    expect(theirs.body.highlights.donations).toEqual([]);
  });
});
