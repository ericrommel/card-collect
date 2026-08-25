import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();

async function registerUser(email: string) {
  const res = await request(app)
    .post("/api/auth/register")
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

async function addCopy(token: string, variantId: string, availability = "KEEP") {
  const res = await request(app)
    .post("/api/my/collection/copies")
    .set("Authorization", `Bearer ${token}`)
    .send({ variantId, availability });
  expect(res.status).toBe(201);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/my/matches — ranked trade/donation matches", () => {
  it("ranks a mutual trade above a smaller donation, includes the documented breakdown, and never leaks sensitive fields", async () => {
    const { setId, variantIds } = await createTestSet(6);

    const me = await registerUser(`me-${Date.now()}@example.com`);
    // I own c1, c2; missing c3, c4, c5, c6.
    await addCopy(me.token, variantIds.c1, "KEEP");
    await addCopy(me.token, variantIds.c2, "TRADE");

    // Trader: owns c4, c5 (TRADE) — I'm missing both. Trader is missing c1, c2, c3
    // and I have c2 marked TRADE, which covers c2 for them.
    const trader = await registerUser(`trader-${Date.now()}@example.com`);
    await addCopy(trader.token, variantIds.c4, "TRADE");
    await addCopy(trader.token, variantIds.c5, "TRADE");
    await addCopy(trader.token, variantIds.c6, "KEEP"); // owned, not missing, not offerable

    // Donor: owns c3 marked GIVE_AWAY — a smaller, one-way benefit to me.
    const donor = await registerUser(`donor-${Date.now()}@example.com`);
    await addCopy(donor.token, variantIds.c3, "GIVE_AWAY");

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
    expect(trade.collector).toEqual({ display_name: trader.email.split("@")[0] });
    expect(trade.current_user).toMatchObject({ cards_received: 2 }); // c4, c5
    expect(trade.other_collector).toMatchObject({ cards_received: 1 }); // c2
    expect(trade.balance).toEqual({ difference: 1 });
    expect((trade.proposed_exchange as any).you_receive.map((c: any) => c.number).sort()).toEqual(["c4", "c5"]);
    expect((trade.proposed_exchange as any).they_receive.map((c: any) => c.number)).toEqual(["c2"]);

    // 16. donation stays explicitly typed, with no fabricated reciprocal side.
    expect(donation.type).toBe("DONATION");
    expect(donation.other_collector).toBeUndefined();
    expect(donation.balance).toBeUndefined();
    expect((donation.proposed_exchange as any).they_receive).toEqual([]);
    expect((donation.proposed_exchange as any).you_receive.map((c: any) => c.number)).toEqual(["c3"]);

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

  it("requires setId and authentication", async () => {
    const { setId } = await createTestSet(1);
    const me = await registerUser(`noauth-${Date.now()}@example.com`);
    expect((await request(app).get(`/api/my/matches?setId=${setId}`)).status).toBe(401);
    expect((await request(app).get("/api/my/matches").set("Authorization", `Bearer ${me.token}`)).status).toBe(400);
  });
});
