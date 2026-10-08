import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();

async function registerUser(email: string, displayName?: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .set("X-Auth-Mode", "bearer")
    .send({ email, password: "password123", displayName: displayName ?? email.split("@")[0] });
  expect(res.status).toBe(201);
  return {
    token: res.body.token as string,
    userId: res.body.user.id as string,
    email: res.body.user.email as string,
  };
}

async function createTestSet(cardCount: number) {
  const stamp = `${Date.now()}-${Math.random()}`;
  const universe = await prisma.collectibleUniverse.create({
    data: { name: "Exchange Test Universe", slug: `exchange-universe-${stamp}` },
  });
  const set = await prisma.set.create({
    data: { universeId: universe.id, name: "Exchange Test Set", code: `ETS-${stamp}` },
  });
  const variantIds: Record<string, string> = {};
  for (let n = 1; n <= cardCount; n++) {
    const number = `c${n}`;
    const collectible = await prisma.collectible.create({ data: { setId: set.id, number, name: `Card ${n}` } });
    const variant = await prisma.variant.create({
      data: { collectibleId: collectible.id, name: "Base", isDefault: true },
    });
    variantIds[number] = variant.id;
  }
  return { setId: set.id, variantIds };
}

async function addCopy(token: string, variantId: string, availability = "KEEP", condition?: string) {
  const res = await request(app)
    .post("/api/my/collection/copies")
    .set("Authorization", `Bearer ${token}`)
    .send({ variantId, availability, ...(condition ? { condition } : {}) });
  expect(res.status).toBe(201);
  return res.body.copy as { id: string; condition: string | null; reserved: boolean; created_at: string };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("exchange reservation races", () => {
  it("keeps one physical copy out of two proposals at the same time", async () => {
    const { setId, variantIds } = await createTestSet(2);
    const stamp = Date.now();
    const alice = await registerUser(`alice-race-${stamp}@example.com`, "Alice Race");
    const bob = await registerUser(`bob-race-${stamp}@example.com`, "Bob Race");
    // Alice offers c1 and is missing c2. Bob offers c2 and is missing c1.
    // Each side has a single eligible copy, so both proposals fight for the same rows.
    await addCopy(alice.token, variantIds.c1, "TRADE", "Near Mint");
    await addCopy(bob.token, variantIds.c2, "TRADE", "Good");

    const matches = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(alice.token));
    expect(matches.status).toBe(200);
    const trade = (matches.body.matches as Array<{ type: string; collector: { ref: string } }>).find(
      (match) => match.type === "MUTUAL_TRADE",
    );
    expect(trade?.collector.ref).toBeTruthy();

    const body = { set_id: setId, collector_ref: trade!.collector.ref, type: "MUTUAL_TRADE" };
    const [first, second] = await Promise.all([
      request(app).post("/api/my/exchanges").set(auth(alice.token)).send(body),
      request(app).post("/api/my/exchanges").set(auth(alice.token)).send(body),
    ]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const open = await prisma.exchange.findMany({ where: { setId, status: "PROPOSED" } });
    expect(open).toHaveLength(1);
    const reserved = await prisma.userCopy.findMany({
      where: { reservedByExchangeId: { not: null }, variant: { collectible: { setId } } },
    });
    expect(reserved.length).toBeGreaterThan(0);
    expect(new Set(reserved.map((copy) => copy.reservedByExchangeId))).toEqual(new Set([open[0].id]));
  });
});

describe("exchanges", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/my/exchanges")).status).toBe(401);
    expect((await request(app).post("/api/my/exchanges").send({})).status).toBe(401);
  });

  it("proposes a mutual trade, reserves the oldest offered copy, and transfers it only after both confirm", async () => {
    const { setId, variantIds } = await createTestSet(3);
    await prisma.collectible.updateMany({
      where: { setId, number: "c3" },
      data: { metadata: JSON.stringify({ kind: "Event", ink: "Leaf", note: "not-on-the-exchange" }) },
    });
    const alice = await registerUser(`alice-x-${Date.now()}@example.com`, "Alice Trader");
    const bob = await registerUser(`bob-x-${Date.now()}@example.com`, "Bob Trader");
    const carol = await registerUser(`carol-x-${Date.now()}@example.com`, "Carol");

    const aliceOlder = await addCopy(alice.token, variantIds.c2, "TRADE", "Played");
    const aliceNewer = await addCopy(alice.token, variantIds.c2, "TRADE", "Mint");
    const bobCopy = await addCopy(bob.token, variantIds.c3, "TRADE", "Good");
    // Force a known age order. SQLite's CURRENT_TIMESTAMP is second-resolution, so two
    // inserts in the same second would otherwise make "oldest copy" depend on id sort.
    await prisma.userCopy.update({
      where: { id: aliceOlder.id },
      data: { createdAt: new Date("2020-01-01T00:00:00Z") },
    });
    await prisma.userCopy.update({
      where: { id: aliceNewer.id },
      data: { createdAt: new Date("2024-01-01T00:00:00Z") },
    });

    const matches = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(alice.token));
    expect(matches.status).toBe(200);
    const trade = (
      matches.body.matches as Array<{
        type: string;
        collector: { ref: string };
        current_user: { completion_before: number; completion_after: number };
        other_collector: { completion_before: number; completion_after: number };
      }>
    ).find((match) => match.type === "MUTUAL_TRADE");
    expect(trade?.collector.ref).toBeTruthy();
    // Alice keeps a second copy of c2 and gains c3. Bob trades away his only c3.
    expect(trade?.current_user).toMatchObject({ completion_before: 33.3, completion_after: 66.7 });
    expect(trade?.other_collector).toMatchObject({ completion_before: 33.3, completion_after: 33.3 });

    const proposed = await request(app)
      .post("/api/my/exchanges")
      .set(auth(alice.token))
      .send({ set_id: setId, collector_ref: trade!.collector.ref, type: "MUTUAL_TRADE" });
    expect(proposed.status).toBe(201);
    const exchangeId = proposed.body.exchange.id as string;
    expect(proposed.body.exchange).toMatchObject({
      type: "MUTUAL_TRADE",
      status: "PROPOSED",
      role: "proposer",
      actions: ["cancel"],
      you_confirmed: false,
      they_confirmed: false,
    });
    expect(
      proposed.body.exchange.you_give.map((card: { number: string; condition: string }) => [
        card.number,
        card.condition,
      ]),
    ).toEqual([["c2", "Played"]]);
    expect(proposed.body.exchange.you_receive).toMatchObject([
      { number: "c3", condition: "Good", kind: "Event", ink: "Leaf" },
    ]);
    expect(proposed.body.exchange.you_give).toMatchObject([{ number: "c2", kind: null, ink: null }]);
    expect(proposed.body.exchange.other_collector).toEqual({ display_name: "Bob Trader", ref: trade!.collector.ref });
    expect(proposed.body.exchange.projected_completion).toEqual({
      yours: { before: 33.3, after: 66.7 },
      theirs: { before: 33.3, after: 33.3 },
    });

    const raw = JSON.stringify(proposed.body);
    expect(raw).not.toContain("not-on-the-exchange");
    expect(raw).not.toContain(alice.email);
    expect(raw).not.toContain(bob.email);
    expect(raw).not.toContain(alice.userId);
    expect(raw).not.toContain(bob.userId);
    expect(raw).not.toContain(aliceOlder.id);
    expect(raw).not.toContain(aliceNewer.id);
    expect(raw).not.toContain(bobCopy.id);
    expect(raw.toLowerCase()).not.toContain("password");

    const duplicate = await request(app)
      .post("/api/my/exchanges")
      .set(auth(alice.token))
      .send({ set_id: setId, collector_ref: trade!.collector.ref, type: "MUTUAL_TRADE" });
    expect(duplicate.status).toBe(409);

    const aliceCopies = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(alice.token));
    const reserved = (
      aliceCopies.body.copies as Array<{ id: string; reserved: boolean; exchange_id: string | null }>
    ).filter((copy) => copy.reserved);
    expect(reserved.map((copy) => copy.id)).toEqual([aliceOlder.id]);
    expect(reserved[0].exchange_id).toBe(exchangeId);

    const patchReserved = await request(app)
      .patch(`/api/my/collection/copies/${aliceOlder.id}`)
      .set(auth(alice.token))
      .send({ availability: "KEEP" });
    expect(patchReserved.status).toBe(409);
    const deleteReserved = await request(app)
      .delete(`/api/my/collection/copies/${aliceOlder.id}`)
      .set(auth(alice.token));
    expect(deleteReserved.status).toBe(409);

    // The newer duplicate was not promised, so Alice can still change it.
    const patchNewer = await request(app)
      .patch(`/api/my/collection/copies/${aliceNewer.id}`)
      .set(auth(alice.token))
      .send({ availability: "KEEP" });
    expect(patchNewer.status).toBe(200);

    expect((await request(app).get(`/api/my/exchanges/${exchangeId}`).set(auth(carol.token))).status).toBe(404);
    expect((await request(app).post(`/api/my/exchanges/${exchangeId}/accept`).set(auth(carol.token))).status).toBe(404);
    expect((await request(app).post(`/api/my/exchanges/${exchangeId}/accept`).set(auth(alice.token))).status).toBe(409);

    const bobList = await request(app).get("/api/my/exchanges").set(auth(bob.token));
    expect(bobList.body.exchanges).toHaveLength(1);
    expect(bobList.body.exchanges[0]).toMatchObject({
      id: exchangeId,
      role: "counterparty",
      actions: ["accept", "decline"],
      you_give: [{ number: "c3" }],
      you_receive: [{ number: "c2", condition: "Played" }],
      projected_completion: {
        yours: { before: 33.3, after: 33.3 },
        theirs: { before: 33.3, after: 66.7 },
      },
    });

    const accepted = await request(app).post(`/api/my/exchanges/${exchangeId}/accept`).set(auth(bob.token));
    expect(accepted.status).toBe(200);
    expect(accepted.body.exchange.status).toBe("ACCEPTED");
    expect(accepted.body.exchange.actions).toEqual(["confirm", "cancel"]);

    const bobConfirmed = await request(app).post(`/api/my/exchanges/${exchangeId}/confirm`).set(auth(bob.token));
    expect(bobConfirmed.body.exchange).toMatchObject({
      status: "ACCEPTED",
      you_confirmed: true,
      they_confirmed: false,
    });
    // Still Bob's copy until Alice also confirms.
    const bobStillOwns = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(bob.token));
    expect((bobStillOwns.body.copies as Array<{ id: string }>).some((copy) => copy.id === bobCopy.id)).toBe(true);

    const completed = await request(app).post(`/api/my/exchanges/${exchangeId}/confirm`).set(auth(alice.token));
    expect(completed.body.exchange).toMatchObject({
      status: "COMPLETED",
      actions: [],
      you_confirmed: true,
      they_confirmed: true,
      projected_completion: null,
    });

    const again = await request(app).post(`/api/my/exchanges/${exchangeId}/confirm`).set(auth(alice.token));
    expect(again.status).toBe(200);
    expect(again.body.exchange.status).toBe("COMPLETED");

    const aliceAfter = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(alice.token));
    const received = (
      aliceAfter.body.copies as Array<{ id: string; availability: string; condition: string | null; reserved: boolean }>
    ).find((copy) => copy.id === bobCopy.id);
    expect(received).toMatchObject({ availability: "KEEP", condition: "Good", reserved: false });
    const bobAfter = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(bob.token));
    expect((bobAfter.body.copies as Array<{ id: string }>).map((copy) => copy.id)).toEqual([aliceOlder.id]);
    expect(bobAfter.body.copies[0]).toMatchObject({ availability: "KEEP", condition: "Played", reserved: false });
  });

  it("hides a reserved copy from other collectors' matches", async () => {
    const { setId, variantIds } = await createTestSet(3);
    const alice = await registerUser(`alice-hide-${Date.now()}@example.com`);
    const bob = await registerUser(`bob-hide-${Date.now()}@example.com`);
    const dana = await registerUser(`dana-hide-${Date.now()}@example.com`);

    await addCopy(bob.token, variantIds.c3, "TRADE");
    await addCopy(alice.token, variantIds.c2, "TRADE");
    // Dana already owns c2, so she has no trade with Alice. She does have one with Bob (c1 for c3).
    await addCopy(dana.token, variantIds.c1, "TRADE");
    await addCopy(dana.token, variantIds.c2, "KEEP");

    const before = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(dana.token));
    expect(before.body.matches).toHaveLength(1);
    expect(before.body.matches[0].type).toBe("MUTUAL_TRADE");

    const aliceMatches = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(alice.token));
    const trade = (aliceMatches.body.matches as Array<{ type: string; collector: { ref: string } }>).find(
      (match) => match.type === "MUTUAL_TRADE",
    );
    const proposed = await request(app)
      .post("/api/my/exchanges")
      .set(auth(alice.token))
      .send({ set_id: setId, collector_ref: trade!.collector.ref, type: "MUTUAL_TRADE" });
    expect(proposed.status).toBe(201);

    const after = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(dana.token));
    expect(after.body.matches).toEqual([]);

    const aliceAfter = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(alice.token));
    const still = (aliceAfter.body.matches as Array<{ type: string; open_exchange_id?: string }>).find(
      (match) => match.type === "MUTUAL_TRADE",
    );
    expect(still?.open_exchange_id).toBe(proposed.body.exchange.id);
  });

  it("completes a donation without taking anything from the recipient", async () => {
    const { setId, variantIds } = await createTestSet(2);
    const alice = await registerUser(`alice-don-${Date.now()}@example.com`);
    const bob = await registerUser(`bob-don-${Date.now()}@example.com`);
    await addCopy(alice.token, variantIds.c1, "KEEP");
    const gift = await addCopy(bob.token, variantIds.c2, "GIVE_AWAY", "Excellent");

    const matches = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(alice.token));
    const donation = (matches.body.matches as Array<{ type: string; collector: { ref: string } }>).find(
      (match) => match.type === "DONATION",
    );
    const proposed = await request(app)
      .post("/api/my/exchanges")
      .set(auth(alice.token))
      .send({ set_id: setId, collector_ref: donation!.collector.ref, type: "DONATION" });
    expect(proposed.status).toBe(201);
    expect(proposed.body.exchange.you_give).toEqual([]);
    expect(proposed.body.exchange.you_receive).toMatchObject([{ number: "c2", condition: "Excellent" }]);
    // Alice gains a card. Bob gives away the only copy he has.
    expect(proposed.body.exchange.projected_completion).toEqual({
      yours: { before: 50, after: 100 },
      theirs: { before: 50, after: 0 },
    });

    const aliceCopies = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(alice.token));
    expect((aliceCopies.body.copies as Array<{ reserved: boolean }>).every((copy) => copy.reserved === false)).toBe(
      true,
    );

    const id = proposed.body.exchange.id as string;
    expect((await request(app).post(`/api/my/exchanges/${id}/accept`).set(auth(bob.token))).status).toBe(200);
    expect((await request(app).post(`/api/my/exchanges/${id}/confirm`).set(auth(bob.token))).status).toBe(200);
    expect(
      (await request(app).post(`/api/my/exchanges/${id}/confirm`).set(auth(alice.token))).body.exchange.status,
    ).toBe("COMPLETED");

    const aliceAfter = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(alice.token));
    expect(
      (aliceAfter.body.copies as Array<{ id: string; availability: string }>).find((copy) => copy.id === gift.id),
    ).toMatchObject({
      availability: "KEEP",
    });
    const bobAfter = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(bob.token));
    expect(bobAfter.body.copies).toEqual([]);
  });

  it("releases copies when an accepted exchange is cancelled before both confirm", async () => {
    const { setId, variantIds } = await createTestSet(2);
    const alice = await registerUser(`alice-cancel-${Date.now()}@example.com`);
    const bob = await registerUser(`bob-cancel-${Date.now()}@example.com`);
    const aliceCopy = await addCopy(alice.token, variantIds.c1, "TRADE");
    const bobCopy = await addCopy(bob.token, variantIds.c2, "TRADE");

    const matches = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(alice.token));
    const trade = (matches.body.matches as Array<{ collector: { ref: string } }>)[0];
    const proposed = await request(app)
      .post("/api/my/exchanges")
      .set(auth(alice.token))
      .send({ set_id: setId, collector_ref: trade.collector.ref, type: "MUTUAL_TRADE" });
    const id = proposed.body.exchange.id as string;
    await request(app).post(`/api/my/exchanges/${id}/accept`).set(auth(bob.token));
    await request(app).post(`/api/my/exchanges/${id}/confirm`).set(auth(bob.token));

    const cancelled = await request(app).post(`/api/my/exchanges/${id}/cancel`).set(auth(alice.token));
    expect(cancelled.body.exchange.status).toBe("CANCELLED");
    expect(cancelled.body.exchange.actions).toEqual([]);
    expect(cancelled.body.exchange.projected_completion).toBeNull();

    const aliceAfter = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(alice.token));
    expect(aliceAfter.body.copies).toMatchObject([{ id: aliceCopy.id, availability: "TRADE", reserved: false }]);
    const bobAfter = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(bob.token));
    expect(bobAfter.body.copies).toMatchObject([{ id: bobCopy.id, availability: "TRADE", reserved: false }]);
  });

  it("declines a proposal and does not reveal it to anyone else", async () => {
    const { setId, variantIds } = await createTestSet(2);
    const alice = await registerUser(`alice-no-${Date.now()}@example.com`);
    const bob = await registerUser(`bob-no-${Date.now()}@example.com`);
    await addCopy(alice.token, variantIds.c1, "TRADE");
    await addCopy(bob.token, variantIds.c2, "GIVE_AWAY");

    const matches = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(alice.token));
    const donation = (matches.body.matches as Array<{ type: string; collector: { ref: string } }>).find(
      (match) => match.type === "DONATION",
    );
    const proposed = await request(app)
      .post("/api/my/exchanges")
      .set(auth(alice.token))
      .send({ set_id: setId, collector_ref: donation!.collector.ref, type: "DONATION" });
    const id = proposed.body.exchange.id as string;

    const share = await request(app).put(`/api/my/sets/${setId}/share`).set(auth(bob.token)).send({ enabled: true });
    const publicRes = await request(app).get(`/api/public/collections/${share.body.share.share_id}`);
    expect(JSON.stringify(publicRes.body)).not.toContain(donation!.collector.ref);
    expect(JSON.stringify(publicRes.body)).not.toContain('"condition"');

    const declined = await request(app).post(`/api/my/exchanges/${id}/decline`).set(auth(bob.token));
    expect(declined.body.exchange.status).toBe("DECLINED");
    const bobCopies = await request(app).get(`/api/my/collection?setId=${setId}`).set(auth(bob.token));
    expect(bobCopies.body.copies[0].reserved).toBe(false);
  });

  it("rejects a proposal that is not currently possible, a self-proposal, an unknown collector, and an unknown condition", async () => {
    const { setId, variantIds } = await createTestSet(1);
    const alice = await registerUser(`alice-bad-${Date.now()}@example.com`);
    const bob = await registerUser(`bob-bad-${Date.now()}@example.com`);
    await addCopy(alice.token, variantIds.c1, "KEEP");
    await addCopy(bob.token, variantIds.c1, "KEEP");

    const none = await request(app)
      .post("/api/my/exchanges")
      .set(auth(alice.token))
      .send({ set_id: setId, collector_ref: "not-a-real-collector-ref-value", type: "MUTUAL_TRADE" });
    expect(none.status).toBe(404);

    const self = await prisma.user.findUniqueOrThrow({ where: { id: alice.userId } });
    const selfPropose = await request(app)
      .post("/api/my/exchanges")
      .set(auth(alice.token))
      .send({ set_id: setId, collector_ref: self.publicId, type: "DONATION" });
    expect(selfPropose.status).toBe(400);

    const matches = await request(app).get(`/api/my/matches?setId=${setId}`).set(auth(alice.token));
    expect(matches.body.matches).toEqual([]);
    const bobRow = await prisma.user.findUniqueOrThrow({ where: { id: bob.userId } });
    const unavailable = await request(app)
      .post("/api/my/exchanges")
      .set(auth(alice.token))
      .send({ set_id: setId, collector_ref: bobRow.publicId, type: "MUTUAL_TRADE" });
    expect(unavailable.status).toBe(409);

    const badCondition = await request(app)
      .post("/api/my/collection/copies")
      .set(auth(alice.token))
      .send({ variantId: variantIds.c1, condition: "PSA 10" });
    expect(badCondition.status).toBe(400);
  });
});
