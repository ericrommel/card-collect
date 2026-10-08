import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { rm } from "node:fs/promises";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import {
  IDENTIFY_CANDIDATES_MESSAGE,
  IDENTIFY_UNAVAILABLE_MESSAGE,
  setCardIdentifier,
  unavailableCardIdentifier,
} from "../../src/modules/identification/cardIdentifier.js";
import { imageDirectory } from "../../src/modules/images/store.js";

const app = createApp();

function segment(marker: number, data: Uint8Array): Buffer {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(2 + data.length);
  return Buffer.concat([Buffer.from([0xff, marker]), length, data]);
}

function photo(): Buffer {
  const parts: Uint8Array[] = [
    Buffer.from([0xff, 0xd8]),
    segment(0xe1, Buffer.from("Exif\0\0GPS-SECRET", "binary")),
    segment(0xc0, Buffer.from([0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00])),
    segment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    Buffer.from([0x12, 0xff, 0xd9]),
  ];
  return Buffer.concat(parts);
}

async function registerUser(email: string, displayName: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .set("X-Auth-Mode", "bearer")
    .send({ email, password: "password123", displayName });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function createVariant() {
  const stamp = `${Date.now()}-${Math.random()}`;
  const universe = await prisma.collectibleUniverse.create({
    data: { name: "Photo Universe", slug: `photo-${stamp}` },
  });
  const set = await prisma.set.create({
    data: { universeId: universe.id, name: "Photo Set", code: `PH-${stamp}` },
  });
  const collectible = await prisma.collectible.create({
    data: { setId: set.id, number: "P1", name: "Photo Card" },
  });
  const variant = await prisma.variant.create({
    data: { collectibleId: collectible.id, name: "Base", isDefault: true },
  });
  return { setId: set.id, variantId: variant.id };
}

afterAll(async () => {
  setCardIdentifier(unavailableCardIdentifier);
  await rm(imageDirectory(), { recursive: true, force: true });
  await prisma.$disconnect();
});

describe("private copy photos", () => {
  it("stores a stripped photo for the owner only and does not publish it", async () => {
    const stamp = Date.now();
    const owner = await registerUser(`photo-owner-${stamp}@example.com`, "Photo Owner");
    const other = await registerUser(`photo-other-${stamp}@example.com`, "Photo Other");
    const { setId, variantId } = await createVariant();
    const created = await request(app)
      .post("/api/my/collection/copies")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ variantId, availability: "KEEP" });
    expect(created.status).toBe(201);
    const copyId = created.body.copy.id as string;
    expect(created.body.copy.has_front_image).toBe(false);

    const saved = await request(app)
      .post(`/api/my/collection/copies/${copyId}/images/front`)
      .set("Authorization", `Bearer ${owner.token}`)
      .set("Content-Type", "image/jpeg")
      .send(photo());
    expect(saved.status).toBe(201);
    expect(saved.body.image).toEqual({ side: "front", content_type: "image/jpeg" });

    const listed = await request(app).get("/api/my/collection").set("Authorization", `Bearer ${owner.token}`);
    expect(listed.body.copies[0]).toMatchObject({ id: copyId, has_front_image: true, has_back_image: false });

    const fetched = await request(app)
      .get(`/api/my/collection/copies/${copyId}/images/front`)
      .set("Authorization", `Bearer ${owner.token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(fetched.status).toBe(200);
    expect(fetched.headers["content-type"]).toBe("image/jpeg");
    const bytes = fetched.body as Buffer;
    expect(bytes.includes(Buffer.from("GPS-SECRET"))).toBe(false);
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));

    expect(
      (
        await request(app)
          .get(`/api/my/collection/copies/${copyId}/images/front`)
          .set("Authorization", `Bearer ${other.token}`)
      ).status,
    ).toBe(404);
    expect((await request(app).get(`/api/my/collection/copies/${copyId}/images/front`)).status).toBe(401);

    const share = await request(app)
      .put(`/api/my/sets/${setId}/share`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ enabled: true });
    expect(share.status).toBe(200);
    const published = await request(app).get(`/api/public/collections/${share.body.share.share_id}`);
    expect(published.status).toBe(200);
    const raw = JSON.stringify(published.body);
    expect(raw).not.toContain("has_front_image");
    expect(raw).not.toContain("GPS-SECRET");
    expect(raw).not.toContain("image/jpeg");
  });

  it("does not add a copy when recognition is unavailable or only a guess", async () => {
    const owner = await registerUser(`photo-id-${Date.now()}@example.com`, "Photo Id");
    const before = await prisma.userCopy.count({ where: { ownerId: owner.id } });
    const unavailable = await request(app)
      .post("/api/my/collection/identify")
      .set("Authorization", `Bearer ${owner.token}`)
      .set("Content-Type", "image/jpeg")
      .send(photo());
    expect(unavailable.status).toBe(200);
    expect(unavailable.body).toEqual({
      status: "unavailable",
      candidates: [],
      message: IDENTIFY_UNAVAILABLE_MESSAGE,
    });

    setCardIdentifier({
      identify: () =>
        Promise.resolve({
          status: "candidates",
          message: "trust me",
          candidates: [{ set_code: "PH", number: "P1", name: "Guessed Card", confidence: 0.42 }],
        }),
    });
    const guessed = await request(app)
      .post("/api/my/collection/identify")
      .set("Authorization", `Bearer ${owner.token}`)
      .set("Content-Type", "image/jpeg")
      .send(photo());
    expect(guessed.status).toBe(200);
    expect(guessed.body.status).toBe("candidates");
    expect(guessed.body.message).toBe(IDENTIFY_CANDIDATES_MESSAGE);
    expect(guessed.body.message).not.toMatch(/trust me|verified/i);
    expect(guessed.body.candidates).toEqual([{ set_code: "PH", number: "P1", name: "Guessed Card", confidence: 0.42 }]);
    setCardIdentifier(unavailableCardIdentifier);

    const after = await prisma.userCopy.count({ where: { ownerId: owner.id } });
    expect(after).toBe(before);
    expect(
      (
        await request(app)
          .post("/api/my/collection/identify")
          .set("Authorization", `Bearer ${owner.token}`)
          .set("Content-Type", "image/svg+xml")
          .send("<svg/>")
      ).status,
    ).toBe(400);
  });

  it("removes the photo when the copy is deleted or the exchange is completed", async () => {
    const stamp = Date.now();
    const alice = await registerUser(`photo-alice-${stamp}@example.com`, "Photo Alice");
    const bob = await registerUser(`photo-bob-${stamp}@example.com`, "Photo Bob");
    const { setId, variantId } = await createVariant();
    const second = await prisma.collectible.create({
      data: { setId, number: "P2", name: "Other Photo Card" },
    });
    const secondVariant = await prisma.variant.create({
      data: { collectibleId: second.id, name: "Base", isDefault: true },
    });

    async function add(token: string, id: string, availability: string) {
      const res = await request(app)
        .post("/api/my/collection/copies")
        .set("Authorization", `Bearer ${token}`)
        .send({ variantId: id, availability });
      expect(res.status).toBe(201);
      return res.body.copy.id as string;
    }

    const aliceTrade = await add(alice.token, variantId, "TRADE");
    await add(bob.token, secondVariant.id, "TRADE");
    const uploaded = await request(app)
      .post(`/api/my/collection/copies/${aliceTrade}/images/front`)
      .set("Authorization", `Bearer ${alice.token}`)
      .set("Content-Type", "image/jpeg")
      .send(photo());
    expect(uploaded.status).toBe(201);

    const matches = await request(app)
      .get(`/api/my/matches?setId=${setId}`)
      .set("Authorization", `Bearer ${alice.token}`);
    const trade = (matches.body.matches as Array<{ type: string; collector: { ref: string } }>).find(
      (match) => match.type === "MUTUAL_TRADE",
    );
    expect(trade?.collector.ref).toBeTruthy();
    const proposed = await request(app)
      .post("/api/my/exchanges")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ set_id: setId, collector_ref: trade!.collector.ref, type: "MUTUAL_TRADE" });
    expect(proposed.status).toBe(201);
    const exchangeId = proposed.body.exchange.id as string;
    expect(
      (await request(app).post(`/api/my/exchanges/${exchangeId}/accept`).set("Authorization", `Bearer ${bob.token}`))
        .status,
    ).toBe(200);
    expect(
      (await request(app).post(`/api/my/exchanges/${exchangeId}/confirm`).set("Authorization", `Bearer ${bob.token}`))
        .status,
    ).toBe(200);
    expect(
      (await request(app).post(`/api/my/exchanges/${exchangeId}/confirm`).set("Authorization", `Bearer ${alice.token}`))
        .status,
    ).toBe(200);

    expect(
      (
        await request(app)
          .get(`/api/my/collection/copies/${aliceTrade}/images/front`)
          .set("Authorization", `Bearer ${alice.token}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/my/collection/copies/${aliceTrade}/images/front`)
          .set("Authorization", `Bearer ${bob.token}`)
      ).status,
    ).toBe(404);

    const kept = await add(alice.token, secondVariant.id, "KEEP");
    expect(
      (
        await request(app)
          .post(`/api/my/collection/copies/${kept}/images/back`)
          .set("Authorization", `Bearer ${alice.token}`)
          .set("Content-Type", "image/jpeg")
          .send(photo())
      ).status,
    ).toBe(201);
    expect(
      (await request(app).delete(`/api/my/collection/copies/${kept}`).set("Authorization", `Bearer ${alice.token}`))
        .status,
    ).toBe(204);
    expect(await prisma.copyImage.count({ where: { copyId: kept } })).toBe(0);
  });
});
