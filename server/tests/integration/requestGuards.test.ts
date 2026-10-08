import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { authHitWindow } from "../../src/modules/auth/routes.js";

const app = createApp();

afterAll(async () => {
  delete process.env.AUTH_RATE_LIMIT;
  delete process.env.PROPOSE_RATE_LIMIT;
  authHitWindow.clear();
  await prisma.$disconnect();
});

describe("request guards", () => {
  it("rejects a JSON body it cannot parse", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Content-Type", "application/json")
      .send("{");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("sends nosniff, no-store, and frame denial on API responses", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns 429 after too many sign-in attempts from one address", async () => {
    process.env.AUTH_RATE_LIMIT = "2";
    authHitWindow.clear();
    const email = `limited-${Date.now()}@example.com`;
    const send = () =>
      request(app)
        .post("/api/auth/login")
        .set("Origin", "http://localhost:5173")
        .send({ email, password: "password123" });

    expect((await send()).status).toBe(401);
    expect((await send()).status).toBe(401);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    expect(blocked.body.error).toMatch(/Too many attempts/);

    delete process.env.AUTH_RATE_LIMIT;
    authHitWindow.clear();
  });

  it("returns 429 after too many proposals from one account", async () => {
    process.env.PROPOSE_RATE_LIMIT = "1";
    const email = `propose-limit-${Date.now()}@example.com`;
    const registered = await request(app)
      .post("/api/auth/register")
      .set("X-Auth-Mode", "bearer")
      .send({ email, password: "password123", displayName: "Propose Limit" });
    expect(registered.status).toBe(201);

    const send = () =>
      request(app).post("/api/my/exchanges").set("Authorization", `Bearer ${registered.body.token}`).send({});

    expect((await send()).status).toBe(400);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    expect(blocked.body.error).toMatch(/Too many proposals/);
    delete process.env.PROPOSE_RATE_LIMIT;
  });
});
