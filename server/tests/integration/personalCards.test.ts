import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();
let sequence = 0;

async function register(name = "Writer") {
  sequence += 1;
  const email = `written-${Date.now()}-${sequence}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .set("X-Auth-Mode", "bearer")
    .send({ email, password: "password123", displayName: name });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const cardBody = {
  name: "Private Zebra Relic",
  game: "Desk Game",
  set_name: "Notes",
  number: "NZ-01",
  availability: "TRADE",
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe("private written cards", () => {
  it("keeps a typed card on that account and out of the catalog, matches, and shares", async () => {
    const owner = await register("Owner");
    const other = await register("Other");
    const catalogsBefore = await prisma.collectible.count();
    const dashboardBefore = await request(app).get("/api/my/dashboard").set(auth(owner.token));
    expect(dashboardBefore.status).toBe(200);

    const created = await request(app).post("/api/my/personal-cards").set(auth(owner.token)).send(cardBody);
    expect(created.status).toBe(201);
    expect(created.body.card.name).toBe("Private Zebra Relic");
    expect(created.body.card.number).toBe("NZ-01");
    expect(created.body.card.copy_count).toBe(1);
    expect(created.body.card.rawName).toBeUndefined();
    expect(created.body.card.normalizedKey).toBeUndefined();
    const cardId = created.body.card.id as string;
    const copyId = created.body.card.copies[0].id as string;

    const stored = await prisma.personalCard.findUnique({ where: { id: cardId } });
    expect(stored?.rawName).toBe("Private Zebra Relic");
    expect(stored?.ownerId).toBe(owner.userId);

    expect(await prisma.collectible.count()).toBe(catalogsBefore);
    const dashboardAfter = await request(app).get("/api/my/dashboard").set(auth(owner.token));
    expect(dashboardAfter.body.totals).toEqual(dashboardBefore.body.totals);

    const search = await request(app).get("/api/catalog/search").query({ q: "Private Zebra" });
    expect(search.status).toBe(200);
    expect(JSON.stringify(search.body)).not.toContain("Private Zebra Relic");

    const ownList = await request(app).get("/api/my/personal-cards").set(auth(owner.token));
    expect(ownList.status).toBe(200);
    expect(ownList.body.note_count).toBe(1);
    expect(ownList.body.extra_count).toBe(0);
    expect(ownList.body.notes).toHaveLength(1);

    const otherList = await request(app).get("/api/my/personal-cards").set(auth(other.token));
    expect(otherList.body.note_count).toBe(0);
    const otherRead = await request(app)
      .patch(`/api/my/personal-cards/${cardId}`)
      .set(auth(other.token))
      .send(cardBody);
    expect(otherRead.status).toBe(404);
    const otherDelete = await request(app).delete(`/api/my/personal-copies/${copyId}`).set(auth(other.token));
    expect(otherDelete.status).toBe(404);

    const universe = await prisma.collectibleUniverse.create({
      data: { name: "Written isolation", slug: `written-iso-${Date.now()}-${sequence}` },
    });
    const set = await prisma.set.create({
      data: { universeId: universe.id, name: "Isolation set", code: `ISO-${Date.now()}-${sequence}` },
    });
    const collectible = await prisma.collectible.create({
      data: { setId: set.id, number: "1", name: "Catalog only" },
    });
    const variant = await prisma.variant.create({ data: { collectibleId: collectible.id, name: "Base" } });
    await request(app)
      .post("/api/my/collection/copies")
      .set(auth(owner.token))
      .send({ variantId: variant.id, availability: "TRADE" });
    await request(app)
      .post("/api/my/collection/copies")
      .set(auth(other.token))
      .send({ variantId: variant.id, availability: "KEEP" });

    const matches = await request(app).get("/api/my/matches").query({ setId: set.id }).set(auth(other.token));
    expect(matches.status).toBe(200);
    expect(JSON.stringify(matches.body)).not.toContain("Private Zebra Relic");
    expect(JSON.stringify(matches.body)).not.toContain(cardId);

    const share = await request(app).put(`/api/my/sets/${set.id}/share`).set(auth(owner.token)).send({ enabled: true });
    expect(share.status).toBe(200);
    const pub = await request(app).get(`/api/public/collections/${share.body.share.share_id}`);
    expect(pub.status).toBe(200);
    expect(JSON.stringify(pub.body)).not.toContain("Private Zebra Relic");
    expect(JSON.stringify(pub.body)).not.toContain("Desk Game");
  });

  it("asks before a second copy, keeps the original text, and removes the note with the last copy", async () => {
    const owner = await register();
    const first = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ ...cardBody, name: "Ace", number: "A-1", printing: "Foil", availability: "KEEP" });
    expect(first.status).toBe(201);
    const cardId = first.body.card.id as string;

    const duplicate = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ ...cardBody, name: "ace", number: "a-1", printing: "Base", availability: "KEEP" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("already_written");
    expect(duplicate.body.card_id).toBe(cardId);

    const second = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ ...cardBody, name: "ace", number: "a-1", printing: "Base", availability: "GIVE_AWAY", add_copy: true });
    expect(second.status).toBe(201);
    expect(second.body.card.copy_count).toBe(2);
    expect(second.body.card.copies.map((copy: { printing: string | null }) => copy.printing).sort()).toEqual([
      "Base",
      "Foil",
    ]);

    const listed = await request(app).get("/api/my/personal-cards").set(auth(owner.token));
    const row = listed.body.notes.find((note: { id: string }) => note.id === cardId);
    expect(row.copy_count).toBe(2);
    expect(listed.body.extra_count).toBeGreaterThanOrEqual(1);

    const renamed = await request(app)
      .patch(`/api/my/personal-cards/${cardId}`)
      .set(auth(owner.token))
      .send({ name: "Ace Fixed", game: "Desk Game", set_name: "Notes", number: "A-1" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.card.name).toBe("Ace Fixed");
    const raw = await prisma.personalCard.findUnique({ where: { id: cardId } });
    expect(raw?.rawName).toBe("Ace");
    expect(raw?.name).toBe("Ace Fixed");

    const copyId = second.body.card.copies[0].id as string;
    const otherCopyId = second.body.card.copies[1].id as string;
    expect(
      (await request(app).delete(`/api/my/personal-copies/${copyId}`).set(auth(owner.token))).body.deleted_card,
    ).toBe(false);
    const last = await request(app).delete(`/api/my/personal-copies/${otherCopyId}`).set(auth(owner.token));
    expect(last.status).toBe(200);
    expect(last.body.deleted_card).toBe(true);
    expect(await prisma.personalCard.findUnique({ where: { id: cardId } })).toBeNull();
  });

  it("does not merge a different spelling, another account, or a no-number name by itself", async () => {
    const owner = await register();
    const other = await register();
    await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ ...cardBody, name: "Harbor Light", number: "H-1", availability: "KEEP" });

    const otherSpelling = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ ...cardBody, name: "Harbour Light", number: "H-1", availability: "KEEP" });
    expect(otherSpelling.status).toBe(201);

    const otherAccount = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(other.token))
      .send({ ...cardBody, name: "Harbor Light", number: "H-1", availability: "KEEP" });
    expect(otherAccount.status).toBe(201);
    expect(otherAccount.body.card.id).not.toBe(otherSpelling.body.card.id);

    const unmarked = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ name: "Loose", game: "Desk Game", set_name: "Notes", availability: "KEEP" });
    expect(unmarked.status).toBe(400);

    const firstLoose = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ name: "Loose", game: "Desk Game", set_name: "Notes", no_number: true, availability: "KEEP" });
    expect(firstLoose.status).toBe(201);
    const again = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ name: "Loose", game: "Desk Game", set_name: "Notes", no_number: true, availability: "SELL" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("confirm_same");

    const different = await request(app).post("/api/my/personal-cards").set(auth(owner.token)).send({
      name: "Loose",
      game: "Desk Game",
      set_name: "Notes",
      no_number: true,
      different_card: true,
      availability: "KEEP",
    });
    expect(different.status).toBe(201);
    expect(different.body.card.id).not.toBe(firstLoose.body.card.id);

    const same = await request(app).post("/api/my/personal-cards").set(auth(owner.token)).send({
      name: "Loose",
      game: "Desk Game",
      set_name: "Notes",
      no_number: true,
      same_card_id: firstLoose.body.card.id,
      availability: "KEEP",
    });
    expect(same.status).toBe(201);
    expect(same.body.card.id).toBe(firstLoose.body.card.id);
    expect(same.body.card.copy_count).toBe(2);

    const link = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ ...cardBody, name: "see https://example.test", availability: "KEEP" });
    expect(link.status).toBe(400);
    expect(link.body.error).toBe("Use a name that isn't an email address or a link.");
  });

  it("refuses a correction that would collide with another note", async () => {
    const owner = await register();
    const first = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ ...cardBody, name: "North", number: "N-1", availability: "KEEP" });
    const second = await request(app)
      .post("/api/my/personal-cards")
      .set(auth(owner.token))
      .send({ ...cardBody, name: "South", number: "S-1", availability: "KEEP" });
    const clash = await request(app)
      .patch(`/api/my/personal-cards/${second.body.card.id}`)
      .set(auth(owner.token))
      .send({ name: "North", game: "Desk Game", set_name: "Notes", number: "N-1" });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("already_written");
    expect(clash.body.card_id).toBe(first.body.card.id);
    const unchanged = await prisma.personalCard.findUnique({ where: { id: second.body.card.id } });
    expect(unchanged?.name).toBe("South");
  });
});
