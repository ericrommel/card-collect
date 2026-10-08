import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();
let sequence = 0;

async function registerUser(): Promise<string> {
  sequence += 1;
  const res = await request(app)
    .post("/api/auth/register")
    .set("X-Auth-Mode", "bearer")
    .send({
      email: `image-limit-${Date.now()}-${sequence}@example.com`,
      password: "password123",
      displayName: "Image Limit",
    });
  expect(res.status).toBe(201);
  return res.body.token as string;
}

afterAll(async () => {
  delete process.env.IMAGE_RATE_LIMIT;
  delete process.env.IDENTIFY_RATE_LIMIT;
  await prisma.$disconnect();
});

describe("image rate limits", () => {
  it("returns 429 after too many photo uploads from one account", async () => {
    process.env.IMAGE_RATE_LIMIT = "2";
    const token = await registerUser();
    const send = () =>
      request(app).post("/api/my/collection/copies/missing-copy/images/front").set("Authorization", `Bearer ${token}`);

    expect((await send()).status).toBe(404);
    expect((await send()).status).toBe(404);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    expect(blocked.body.error).toBe("Too many photos. Wait a minute and try again.");

    const other = await registerUser();
    const allowed = await request(app)
      .post("/api/my/collection/copies/missing-copy/images/front")
      .set("Authorization", `Bearer ${other}`);
    expect(allowed.status).toBe(404);
    delete process.env.IMAGE_RATE_LIMIT;
  });

  it("returns 429 after too many recognition attempts from one account", async () => {
    process.env.IDENTIFY_RATE_LIMIT = "1";
    const token = await registerUser();
    const send = () => request(app).post("/api/my/collection/identify").set("Authorization", `Bearer ${token}`);

    expect((await send()).status).toBe(400);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    expect(blocked.body.error).toBe("Too many recognition attempts. Wait a minute and try again.");
    delete process.env.IDENTIFY_RATE_LIMIT;
  });
});
