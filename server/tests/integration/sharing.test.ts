import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { SHARE_LINK_LIFETIME_DAYS } from "../../src/modules/sharing/service.js";

const app = createApp();

let setId: string;
let variantIds: string[];

async function registerUser(email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .set("X-Auth-Mode", "bearer")
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
    expect(enableRes.body.share.link_lifetime_days).toBe(SHARE_LINK_LIFETIME_DAYS);
    expect(Math.abs(new Date(enableRes.body.share.expires_at).getTime() - expectedExpiry())).toBeLessThan(60_000);

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
    expect(disableRes.body.share.expires_at).toBeNull();

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
    expect((await request(app).post(`/api/my/sets/${setId}/share/renew`)).status).toBe(401);
  });

  it("stops a public link when its time has passed, and renew keeps the same address", async () => {
    const token = await registerUser(`expiry-${Date.now()}@example.com`);
    const enableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    const shareId = enableRes.body.share.share_id as string;
    const originalExpiry = enableRes.body.share.expires_at as string;

    const touched = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ visibility: { owned: false } });
    expect(touched.body.share.expires_at).toBe(originalExpiry);
    expect(touched.body.share.share_id).toBe(shareId);

    await prisma.collectionShare.update({
      where: { shareId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const unknown = await request(app).get("/api/public/collections/never-existed-share-id");
    const expired = await request(app).get(`/api/public/collections/${shareId}`);
    expect(expired.status).toBe(404);
    expect(expired.body).toEqual(unknown.body);
    expect(JSON.stringify(expired.body)).not.toContain("expires");

    const stillOn = await request(app).get(`/api/my/sets/${setId}/share`).set("Authorization", `Bearer ${token}`);
    expect(stillOn.body.share.enabled).toBe(true);
    expect(new Date(stillOn.body.share.expires_at).getTime()).toBeLessThan(Date.now());

    const renewRes = await request(app)
      .post(`/api/my/sets/${setId}/share/renew`)
      .set("Authorization", `Bearer ${token}`);
    expect(renewRes.status).toBe(200);
    expect(renewRes.body.share.share_id).toBe(shareId);
    expect(Math.abs(new Date(renewRes.body.share.expires_at).getTime() - expectedExpiry())).toBeLessThan(60_000);
    const revived = await request(app).get(`/api/public/collections/${shareId}`);
    expect(revived.status).toBe(200);
    expect(JSON.stringify(revived.body)).not.toContain("expires_at");

    const off = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: false });
    expect(off.body.share.expires_at).toBeNull();
    const refused = await request(app)
      .post(`/api/my/sets/${setId}/share/renew`)
      .set("Authorization", `Bearer ${token}`);
    expect(refused.status).toBe(409);

    const again = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    expect(again.body.share.share_id).toBe(shareId);
    expect(Math.abs(new Date(again.body.share.expires_at).getTime() - expectedExpiry())).toBeLessThan(60_000);

    await prisma.collectionShare.update({
      where: { shareId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const regen = await request(app)
      .post(`/api/my/sets/${setId}/share/regenerate`)
      .set("Authorization", `Bearer ${token}`);
    expect(regen.body.share.share_id).not.toBe(shareId);
    expect(Math.abs(new Date(regen.body.share.expires_at).getTime() - expectedExpiry())).toBeLessThan(60_000);
    expect((await request(app).get(`/api/public/collections/${shareId}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/collections/${regen.body.share.share_id}`)).status).toBe(200);
  });

  it("counts public opens for the owner and does not say who opened the link", async () => {
    const token = await registerUser(`views-${Date.now()}@example.com`);
    const enableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    expect(enableRes.body.share.view_count).toBe(0);
    expect(enableRes.body.share.last_viewed_at).toBeNull();
    const shareId = enableRes.body.share.share_id as string;

    const first = await request(app).get(`/api/public/collections/${shareId}`);
    expect(first.status).toBe(200);
    expect(JSON.stringify(first.body)).not.toContain("view_count");
    expect(JSON.stringify(first.body)).not.toContain("last_viewed");

    const afterOne = await request(app).get(`/api/my/sets/${setId}/share`).set("Authorization", `Bearer ${token}`);
    expect(afterOne.body.share.view_count).toBe(1);
    expect(Math.abs(new Date(afterOne.body.share.last_viewed_at).getTime() - Date.now())).toBeLessThan(60_000);

    expect((await request(app).get(`/api/public/collections/${shareId}`)).status).toBe(200);
    const rushed = await request(app).get(`/api/my/sets/${setId}/share`).set("Authorization", `Bearer ${token}`);
    expect(rushed.body.share.view_count).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await request(app).get(`/api/public/collections/${shareId}`)).status).toBe(200);
    const afterTwo = await request(app).get(`/api/my/sets/${setId}/share`).set("Authorization", `Bearer ${token}`);
    expect(afterTwo.body.share.view_count).toBe(2);

    process.env.SHARE_VIEW_WRITE_LIMIT = "1";
    try {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect((await request(app).get(`/api/public/collections/${shareId}`)).status).toBe(200);
      const capped = await request(app).get(`/api/my/sets/${setId}/share`).set("Authorization", `Bearer ${token}`);
      expect(capped.body.share.view_count).toBe(2);
    } finally {
      delete process.env.SHARE_VIEW_WRITE_LIMIT;
    }

    await prisma.collectionShare.update({
      where: { shareId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect((await request(app).get(`/api/public/collections/${shareId}`)).status).toBe(404);
    const expired = await request(app).get(`/api/my/sets/${setId}/share`).set("Authorization", `Bearer ${token}`);
    expect(expired.body.share.view_count).toBe(2);

    const regen = await request(app)
      .post(`/api/my/sets/${setId}/share/regenerate`)
      .set("Authorization", `Bearer ${token}`);
    expect(regen.body.share.view_count).toBe(0);
    expect(regen.body.share.last_viewed_at).toBeNull();
    expect(regen.body.share.share_id).not.toBe(shareId);
  });

  it("omits a reserved copy from public offers and keeps a free copy of the same card", async () => {
    const stamp = Date.now();
    const ownerName = `share-owner-${stamp}`;
    const otherName = `share-other-${stamp}`;
    const owner = await registerUser(`${ownerName}@example.com`);
    const other = await registerUser(`${otherName}@example.com`);

    await addCopy(owner, variantIds[0], "TRADE");
    await addCopy(owner, variantIds[1], "TRADE");
    await addCopy(owner, variantIds[1], "TRADE");
    await addCopy(owner, variantIds[3], "GIVE_AWAY");
    await addCopy(other, variantIds[2], "TRADE");

    const matches = await request(app).get(`/api/my/matches?setId=${setId}`).set("Authorization", `Bearer ${owner}`);
    expect(matches.status).toBe(200);
    const trade = (
      matches.body.matches as Array<{ type: string; collector: { display_name: string; ref: string } }>
    ).find((match) => match.type === "MUTUAL_TRADE" && match.collector.display_name === otherName);
    expect(trade?.collector.ref).toBeTruthy();

    const proposed = await request(app)
      .post("/api/my/exchanges")
      .set("Authorization", `Bearer ${owner}`)
      .send({ set_id: setId, collector_ref: trade!.collector.ref, type: "MUTUAL_TRADE" });
    expect(proposed.status).toBe(201);

    const enableRes = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ enabled: true });
    expect(enableRes.status).toBe(200);

    const publicRes = await request(app).get(`/api/public/collections/${enableRes.body.share.share_id}`);
    expect(publicRes.status).toBe(200);
    const tradeNumbers = (publicRes.body.trade_offers as Array<{ number: string }>).map((card) => card.number);
    expect(tradeNumbers).toEqual(["S-002"]);
    expect(publicRes.body.give_away_offers).toEqual([expect.objectContaining({ number: "S-004" })]);
    expect((publicRes.body.owned as Array<{ number: string }>).map((card) => card.number).sort()).toEqual([
      "S-001",
      "S-002",
      "S-004",
    ]);
    const raw = JSON.stringify(publicRes.body);
    expect(raw).not.toContain("reserved");
    expect(raw).not.toContain(proposed.body.exchange.id as string);
  });

  it("publishes a catalog kind and leaves other metadata off the public page", async () => {
    const stamp = `${Date.now()}-${Math.random()}`;
    const universe = await prisma.collectibleUniverse.create({
      data: { name: "Kind Share Universe", slug: `kind-share-${stamp}` },
    });
    const set = await prisma.set.create({
      data: { universeId: universe.id, name: "Kind Share Set", code: `KS-${stamp}` },
    });
    const place = await prisma.collectible.create({
      data: {
        setId: set.id,
        number: "KS-001",
        name: "Lantern Test",
        rarity: "Common",
        metadata: JSON.stringify({ kind: "Place", ink: "Sea", note: "hidden-share-note" }),
      },
    });
    const plain = await prisma.collectible.create({
      data: { setId: set.id, number: "KS-002", name: "Plain Test" },
    });
    const placeVariant = await prisma.variant.create({
      data: { collectibleId: place.id, name: "Base", isDefault: true },
    });
    await prisma.variant.create({ data: { collectibleId: plain.id, name: "Base", isDefault: true } });

    const token = await registerUser(`kind-share-${stamp}@example.com`);
    await addCopy(token, placeVariant.id, "KEEP");
    const enableRes = await request(app)
      .put(`/api/my/sets/${set.id}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    expect(enableRes.status).toBe(200);

    const publicRes = await request(app).get(`/api/public/collections/${enableRes.body.share.share_id}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.owned).toEqual([
      expect.objectContaining({ number: "KS-001", name: "Lantern Test", kind: "Place", ink: "Sea" }),
    ]);
    expect(publicRes.body.missing).toEqual([expect.objectContaining({ number: "KS-002", kind: null, ink: null })]);
    expect(publicRes.body.owned[0]).not.toHaveProperty("condition");
    const raw = JSON.stringify(publicRes.body);
    expect(raw).not.toContain("hidden-share-note");
    expect(raw).not.toContain("metadata");
  });
});

function expectedExpiry(): number {
  return Date.now() + SHARE_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
}
