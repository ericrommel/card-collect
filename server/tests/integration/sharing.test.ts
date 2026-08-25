import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();

let setId: string;
let variantIds: string[];

async function registerUser(email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123", displayName: email.split("@")[0] });
  expect(res.status).toBe(201);
  return res.body.token as string;
}

async function addCopy(token: string, variantId: string, availability = "KEEP") {
  const res = await request(app)
    .post("/api/my/collection/copies")
    .set("Authorization", `Bearer ${token}`)
    .send({ variantId, availability });
  expect(res.status).toBe(201);
  return res.body.copy.id as string;
}

beforeAll(async () => {
  const universe = await prisma.collectibleUniverse.create({
    data: { name: "Sharing Test Universe", slug: `sharing-universe-${Date.now()}` },
  });
  const set = await prisma.set.create({
    data: { universeId: universe.id, name: "Sharing Test Set", code: `SHR-${Date.now()}` },
  });
  setId = set.id;

  const numbers = ["S-001", "S-002", "S-003", "S-004"];
  variantIds = [];
  for (const number of numbers) {
    const collectible = await prisma.collectible.create({ data: { setId: set.id, number, name: `Card ${number}` } });
    const variant = await prisma.variant.create({
      data: { collectibleId: collectible.id, name: "Base", isDefault: true },
    });
    variantIds.push(variant.id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("collection sharing", () => {
  it("returns 404 for a set that has never enabled sharing", async () => {
    const res = await request(app).get("/api/public/collections/never-existed-share-id");
    expect(res.status).toBe(404);
  });

  it("full flow: enable, view publicly, disable, and confirm the old link is dead", async () => {
    const token = await registerUser(`sharer-${Date.now()}@example.com`);
    // owned + a duplicate marked TRADE, one GIVE_AWAY, one left missing (variantIds[3] untouched)
    await addCopy(token, variantIds[0], "KEEP");
    await addCopy(token, variantIds[1], "KEEP");
    await addCopy(token, variantIds[1], "TRADE"); // duplicate of card 2
    await addCopy(token, variantIds[2], "GIVE_AWAY");

    // Never enabled yet -> GET returns { share: null }
    const before = await request(app).get(`/api/my/sets/${setId}/share`).set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);
    expect(before.body.share).toBeNull();

    // Enable with default visibility (all true)
    const enableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    expect(enableRes.status).toBe(200);
    const shareId = enableRes.body.share.share_id as string;
    expect(shareId).toMatch(/^[A-Za-z0-9_-]{20,}$/); // non-sequential random token, not a cuid

    // Public view reflects the seeded collection
    const publicRes = await request(app).get(`/api/public/collections/${shareId}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.collector.display_name).toBeTruthy();
    expect(publicRes.body.set.total_count).toBe(4);
    expect(publicRes.body.owned).toHaveLength(3); // card0, card1 (KEEP+TRADE dup), card2 (GIVE_AWAY) — all owned
    expect(publicRes.body.missing).toHaveLength(1); // card3 was never added
    expect(publicRes.body.duplicates).toHaveLength(1);
    expect(publicRes.body.duplicates[0].duplicate_quantity).toBe(1);
    expect(publicRes.body.trade_offers).toHaveLength(1);
    expect(publicRes.body.give_away_offers).toHaveLength(1);
    expect(publicRes.body.completion_percentage).toBeCloseTo(75, 0); // 3 of 4 distinct collectibles owned

    // Disable ("revoke") -> the same shareId now 404s
    const disableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: false });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.share.enabled).toBe(false);

    const afterDisable = await request(app).get(`/api/public/collections/${shareId}`);
    expect(afterDisable.status).toBe(404);
  });

  it("regenerating the share id invalidates the previous one immediately", async () => {
    const token = await registerUser(`regen-${Date.now()}@example.com`);
    const enableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    const firstShareId = enableRes.body.share.share_id as string;
    expect((await request(app).get(`/api/public/collections/${firstShareId}`)).status).toBe(200);

    const regenRes = await request(app)
      .post(`/api/my/sets/${setId}/share/regenerate`)
      .set("Authorization", `Bearer ${token}`);
    expect(regenRes.status).toBe(200);
    const secondShareId = regenRes.body.share.share_id as string;
    expect(secondShareId).not.toBe(firstShareId);
    expect(regenRes.body.share.enabled).toBe(true); // preserved across regenerate

    expect((await request(app).get(`/api/public/collections/${firstShareId}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/collections/${secondShareId}`)).status).toBe(200);
  });

  it("only shows the fields the owner opted into", async () => {
    const token = await registerUser(`visibility-${Date.now()}@example.com`);
    await addCopy(token, variantIds[0], "TRADE");

    const enableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        enabled: true,
        visibility: {
          completion: true,
          owned: false,
          missing: false,
          duplicates: false,
          trade: false,
          give_away: false,
        },
      });
    const shareId = enableRes.body.share.share_id as string;

    const publicRes = await request(app).get(`/api/public/collections/${shareId}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.completion_percentage).toBeDefined();
    expect(publicRes.body.owned).toBeUndefined();
    expect(publicRes.body.missing).toBeUndefined();
    expect(publicRes.body.duplicates).toBeUndefined();
    expect(publicRes.body.trade_offers).toBeUndefined();
    expect(publicRes.body.give_away_offers).toBeUndefined();
  });

  it("never exposes email or internal user/owner ids in the public response", async () => {
    const email = `secret-${Date.now()}@example.com`;
    const token = await registerUser(email);
    const meRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    const internalUserId = meRes.body.user.id as string;

    const enableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    const shareId = enableRes.body.share.share_id as string;

    const publicRes = await request(app).get(`/api/public/collections/${shareId}`);
    const raw = JSON.stringify(publicRes.body);
    expect(raw).not.toContain(email);
    expect(raw).not.toContain(internalUserId);
    expect(raw).not.toContain("email");
    expect(raw.toLowerCase()).not.toContain("password");
    expect(raw.toLowerCase()).not.toContain("token");
  });

  it("the public response never contains location information", async () => {
    const token = await registerUser(`geo-check-${Date.now()}@example.com`);
    const enableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    const shareId = enableRes.body.share.share_id as string;

    const publicRes = await request(app).get(`/api/public/collections/${shareId}`);
    const raw = JSON.stringify(publicRes.body).toLowerCase();
    for (const forbidden of ["location", "latitude", "longitude", "address", "city", "coordinates"]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("one user cannot modify another user's sharing settings", async () => {
    const tokenA = await registerUser(`owner-a-${Date.now()}@example.com`);
    const tokenB = await registerUser(`owner-b-${Date.now()}@example.com`);

    const aEnable = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ enabled: true, visibility: { completion: true } });
    const aShareId = aEnable.body.share.share_id as string;

    // B has no way to address A's share row — B's own PUT on the same setId
    // only ever touches B's own settings. Confirm A's row is untouched.
    await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ enabled: true, visibility: { completion: false, owned: false } });

    const aAfter = await request(app).get(`/api/my/sets/${setId}/share`).set("Authorization", `Bearer ${tokenA}`);
    expect(aAfter.body.share.share_id).toBe(aShareId);
    expect(aAfter.body.share.visibility.completion).toBe(true);

    // B's regenerate must not affect A's link either.
    await request(app).post(`/api/my/sets/${setId}/share/regenerate`).set("Authorization", `Bearer ${tokenB}`);
    const stillA = await request(app).get(`/api/public/collections/${aShareId}`);
    expect(stillA.status).toBe(200);
  });

  it("the public endpoint cannot be used to mutate collection data", async () => {
    const token = await registerUser(`immutable-${Date.now()}@example.com`);
    const enableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    const shareId = enableRes.body.share.share_id as string;

    const putRes = await request(app).put(`/api/public/collections/${shareId}`).send({ enabled: false });
    expect(putRes.status).toBe(404);
    const postRes = await request(app).post(`/api/public/collections/${shareId}`).send({});
    expect(postRes.status).toBe(404);
    const deleteRes = await request(app).delete(`/api/public/collections/${shareId}`);
    expect(deleteRes.status).toBe(404);

    // Sharing itself is unaffected — GET still works.
    expect((await request(app).get(`/api/public/collections/${shareId}`)).status).toBe(200);
  });

  it("requires authentication to read or change share settings", async () => {
    expect((await request(app).get(`/api/my/sets/${setId}/share`)).status).toBe(401);
    expect((await request(app).put(`/api/my/sets/${setId}/share`).send({ enabled: true })).status).toBe(401);
    expect((await request(app).post(`/api/my/sets/${setId}/share/regenerate`)).status).toBe(401);
  });
});
