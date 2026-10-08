import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();

async function registerUser(email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .set("X-Auth-Mode", "bearer")
    .send({ email, password: "password123", displayName: email.split("@")[0] });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, userId: res.body.user.id as string, email: res.body.user.email as string };
}

/** Each test gets its own isolated Set so leftover copies from other tests (matching queries all users) can never leak in. */
async function createTestSet(cardCount: number) {
  const universe = await prisma.collectibleUniverse.create({
    data: { name: "Matching Test Universe", slug: `matching-universe-${Date.now()}-${Math.random()}` },
  });
  const set = await prisma.set.create({
    data: { universeId: universe.id, name: "Matching Test Set", code: `MTS-${Date.now()}-${Math.random()}` },
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
  return res.body.copy as { id: string };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/my/matches — ranked trade/donation matches", () => {
  it("ranks a mutual trade above a smaller donation, includes the documented breakdown, and never leaks sensitive fields", async () => {
    const { setId, variantIds } = await createTestSet(6);

    const me = await registerUser(`me-${Date.now()}@example.com`);
    // I own c1 and two copies of c2, so offering one c2 still leaves c2 in the set.
    // Missing c3, c4, c5, c6.
    await addCopy(me.token, variantIds.c1, "KEEP");
    await addCopy(me.token, variantIds.c2, "KEEP");
    const myTrade = await addCopy(me.token, variantIds.c2, "TRADE", "Played");

    // Trader: owns c4 and c5, each with a spare, and offers the spare. Also owns c6.
    // Trader is missing c2, which my TRADE copy covers. Both sets go up.
    const trader = await registerUser(`trader-${Date.now()}@example.com`);
    await addCopy(trader.token, variantIds.c4, "KEEP");
    const tradeC4 = await addCopy(trader.token, variantIds.c4, "TRADE", "Mint");
    await addCopy(trader.token, variantIds.c5, "KEEP");
    const tradeC5 = await addCopy(trader.token, variantIds.c5, "TRADE");
    await addCopy(trader.token, variantIds.c6, "KEEP"); // owned, not missing, not offerable

    // Donor: owns c3 marked GIVE_AWAY — a smaller, one-way benefit to me.
    const donor = await registerUser(`donor-${Date.now()}@example.com`);
    const gift = await addCopy(donor.token, variantIds.c3, "GIVE_AWAY", "Poor");

    const res = await request(app).get(`/api/my/matches?setId=${setId}`).set("Authorization", `Bearer ${me.token}`);
    expect(res.status).toBe(200);
    const matches = res.body.matches as Array<Record<string, unknown>>;

    expect(matches).toHaveLength(2);
    const trade = matches.find((m) => m.type === "MUTUAL_TRADE")!;
    const donation = matches.find((m) => m.type === "DONATION")!;
    expect(trade).toBeDefined();
    expect(donation).toBeDefined();

    // 13. ordered by score, highest first.
    expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score as number);
    expect(matches[0].type).toBe("MUTUAL_TRADE");

    // 14. documented breakdown present for the trade.
    // `ref` is an opaque collector token, not the account id.
    expect(trade.collector).toMatchObject({ display_name: trader.email.split("@")[0] });
    expect((trade.collector as { ref: string }).ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect((trade.collector as { ref: string }).ref).not.toBe(trader.userId);
    expect(trade.open_exchange_id).toBeUndefined();
    expect(trade.current_user).toMatchObject({
      cards_received: 2,
      completion_before: 33.3,
      completion_after: 66.7,
    }); // c4, c5, and c2 stays
    expect(trade.other_collector).toMatchObject({
      cards_received: 1,
      completion_before: 50,
      completion_after: 66.7,
    }); // c2, and c4 plus c5 stay
    expect(trade.balance).toEqual({ difference: 1 });
    expect((trade.proposed_exchange as any).you_receive.map((c: any) => c.number).sort()).toEqual(["c4", "c5"]);
    expect(
      (trade.proposed_exchange as { you_receive: { number: string; condition: string | null }[] }).you_receive
        .slice()
        .sort((a, b) => a.number.localeCompare(b.number))
        .map((card) => ({ number: card.number, condition: card.condition })),
    ).toEqual([
      { number: "c4", condition: "Mint" },
      { number: "c5", condition: null },
    ]);
    expect((trade.proposed_exchange as any).they_receive.map((c: any) => c.number)).toEqual(["c2"]);
    expect((trade.proposed_exchange as any).they_receive).toMatchObject([{ number: "c2", condition: "Played" }]);

    // 16. donation stays explicitly typed, with no fabricated reciprocal side.
    expect(donation.type).toBe("DONATION");
    expect(donation.other_collector).toBeUndefined();
    expect(donation.balance).toBeUndefined();
    expect((donation.proposed_exchange as any).they_receive).toEqual([]);
    expect((donation.proposed_exchange as any).you_receive.map((c: any) => c.number)).toEqual(["c3"]);
    expect((donation.proposed_exchange as any).you_receive).toMatchObject([{ number: "c3", condition: "Poor" }]);

    // 15. no sensitive/internal fields anywhere in the response.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(me.email);
    expect(raw).not.toContain(trader.email);
    expect(raw).not.toContain(donor.email);
    expect(raw).not.toContain(me.userId);
    expect(raw).not.toContain(trader.userId);
    expect(raw).not.toContain(donor.userId);
    expect(raw.toLowerCase()).not.toContain("password");
    expect(raw.toLowerCase()).not.toContain("email");
    expect(raw.toLowerCase()).not.toContain("location");
    expect(raw).not.toContain(myTrade.id);
    expect(raw).not.toContain(tradeC4.id);
    expect(raw).not.toContain(tradeC5.id);
    expect(raw).not.toContain(gift.id);
  });

  it("returns no match when neither side can help the other", async () => {
    const { setId, variantIds } = await createTestSet(2);
    const me = await registerUser(`solo-me-${Date.now()}@example.com`);
    const stranger = await registerUser(`solo-stranger-${Date.now()}@example.com`);
    await addCopy(me.token, variantIds.c1, "KEEP");
    await addCopy(stranger.token, variantIds.c2, "KEEP"); // nothing offerable on either side

    const res = await request(app).get(`/api/my/matches?setId=${setId}`).set("Authorization", `Bearer ${me.token}`);
    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
  });

  it("shows the free copy when another exchange already reserved the older one", async () => {
    const { setId, variantIds } = await createTestSet(4);
    const me = await registerUser(`cond-me-${Date.now()}@example.com`);
    const trader = await registerUser(`cond-trader-${Date.now()}@example.com`);
    const outsider = await registerUser(`cond-out-${Date.now()}@example.com`);

    await addCopy(me.token, variantIds.c1, "KEEP");
    const myOffer = await addCopy(me.token, variantIds.c2, "TRADE", "Excellent");
    await addCopy(trader.token, variantIds.c4, "KEEP");
    const reserved = await addCopy(trader.token, variantIds.c4, "TRADE", "Poor");
    await addCopy(outsider.token, variantIds.c3, "KEEP");
    const outsiderOffer = await addCopy(outsider.token, variantIds.c3, "TRADE", "Good");

    const outsiderMatches = await request(app)
      .get(`/api/my/matches?setId=${setId}`)
      .set("Authorization", `Bearer ${outsider.token}`);
    const withTrader = (
      outsiderMatches.body.matches as Array<{ type: string; collector: { display_name: string; ref: string } }>
    ).find((match) => match.type === "MUTUAL_TRADE" && match.collector.display_name.startsWith("cond-trader"));
    expect(withTrader?.collector.ref).toBeTruthy();

    const proposed = await request(app)
      .post("/api/my/exchanges")
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ set_id: setId, collector_ref: withTrader!.collector.ref, type: "MUTUAL_TRADE" });
    expect(proposed.status).toBe(201);
    expect(proposed.body.exchange.you_receive).toMatchObject([{ number: "c4", condition: "Poor" }]);

    const newer = await addCopy(trader.token, variantIds.c4, "TRADE", "Mint");
    const mine = await request(app).get(`/api/my/matches?setId=${setId}`).set("Authorization", `Bearer ${me.token}`);
    const trade = (
      mine.body.matches as Array<{
        type: string;
        collector: { display_name: string };
        proposed_exchange: {
          you_receive: Array<{ number: string; condition: string | null }>;
          they_receive: Array<{ number: string; condition: string | null }>;
        };
      }>
    ).find((match) => match.type === "MUTUAL_TRADE" && match.collector.display_name.startsWith("cond-trader"));
    expect(trade?.proposed_exchange.you_receive).toEqual([
      expect.objectContaining({ number: "c4", condition: "Mint" }),
    ]);
    expect(trade?.proposed_exchange.they_receive).toEqual([
      expect.objectContaining({ number: "c2", condition: "Excellent" }),
    ]);

    const raw = JSON.stringify(mine.body);
    expect(raw).not.toContain(reserved.id);
    expect(raw).not.toContain(newer.id);
    expect(raw).not.toContain(myOffer.id);
    expect(raw).not.toContain(outsiderOffer.id);
  });

  it("shows the copy already reserved with this person, not a newer free duplicate", async () => {
    const { setId, variantIds } = await createTestSet(3);
    const me = await registerUser(`held-me-${Date.now()}@example.com`);
    const trader = await registerUser(`held-trader-${Date.now()}@example.com`);

    await addCopy(me.token, variantIds.c2, "KEEP");
    const mine = await addCopy(me.token, variantIds.c2, "TRADE", "Played");
    await addCopy(trader.token, variantIds.c3, "KEEP");
    const older = await addCopy(trader.token, variantIds.c3, "TRADE", "Good");

    const before = await request(app).get(`/api/my/matches?setId=${setId}`).set("Authorization", `Bearer ${me.token}`);
    const trade = (before.body.matches as Array<{ type: string; collector: { ref: string } }>).find(
      (match) => match.type === "MUTUAL_TRADE",
    );
    const proposed = await request(app)
      .post("/api/my/exchanges")
      .set("Authorization", `Bearer ${me.token}`)
      .send({ set_id: setId, collector_ref: trade?.collector.ref, type: "MUTUAL_TRADE" });
    expect(proposed.status).toBe(201);

    const newer = await addCopy(trader.token, variantIds.c3, "TRADE", "Mint");
    const after = await request(app).get(`/api/my/matches?setId=${setId}`).set("Authorization", `Bearer ${me.token}`);
    const still = (
      after.body.matches as Array<{
        type: string;
        proposed_exchange: { you_receive: Array<{ number: string; condition: string | null }> };
      }>
    ).find((match) => match.type === "MUTUAL_TRADE");
    expect(still?.proposed_exchange.you_receive).toEqual([
      expect.objectContaining({ number: "c3", condition: "Good" }),
    ]);

    const raw = JSON.stringify(after.body);
    expect(raw).not.toContain(older.id);
    expect(raw).not.toContain(newer.id);
    expect(raw).not.toContain(mine.id);
  });

  it("requires setId and authentication", async () => {
    const { setId } = await createTestSet(1);
    const me = await registerUser(`noauth-${Date.now()}@example.com`);
    expect((await request(app).get(`/api/my/matches?setId=${setId}`)).status).toBe(401);
    expect((await request(app).get("/api/my/matches").set("Authorization", `Bearer ${me.token}`)).status).toBe(400);
  });
});
