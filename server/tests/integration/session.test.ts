import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const app = createApp();
const APP_ORIGIN = "http://localhost:5173";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("web session cookie", () => {
  it("keeps the JWT out of the browser response and accepts the httpOnly cookie", async () => {
    const email = `cookie-${Date.now()}@example.com`;
    const agent = request.agent(app);

    const missingOrigin = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", displayName: "Cookie User" });
    expect(missingOrigin.status).toBe(403);

    const foreignOrigin = await request(app)
      .post("/api/auth/register")
      .set("Origin", "https://evil.example")
      .send({ email, password: "password123", displayName: "Cookie User" });
    expect(foreignOrigin.status).toBe(403);

    const registered = await agent
      .post("/api/auth/register")
      .set("Origin", APP_ORIGIN)
      .send({ email, password: "password123", displayName: "Cookie User" });
    expect(registered.status).toBe(201);
    expect(registered.body.token).toBeUndefined();
    expect(registered.body.user.email).toBe(email);
    expect(JSON.stringify(registered.body)).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);

    const setCookie = registered.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieHeader = (Array.isArray(setCookie) ? setCookie : [setCookie]).join("\n");
    expect(cookieHeader).toMatch(/cards_collect_session=/);
    expect(cookieHeader.toLowerCase()).toContain("httponly");
    expect(cookieHeader.toLowerCase()).toContain("samesite=lax");

    const anon = await request(app).get("/api/auth/session");
    expect(anon.status).toBe(200);
    expect(anon.body.user).toBeNull();

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);

    const session = await agent.get("/api/auth/session");
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe(email);

    const foreign = await agent.get("/api/auth/me").set("Origin", "https://evil.example");
    expect(foreign.status).toBe(403);

    const blockedLogout = await agent.post("/api/auth/logout");
    expect(blockedLogout.status).toBe(403);
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    const loggedOut = await agent.post("/api/auth/logout").set("Origin", APP_ORIGIN);
    expect(loggedOut.status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("still returns a bearer token when a non-browser client asks for one", async () => {
    const email = `bearer-${Date.now()}@example.com`;
    await request(app)
      .post("/api/auth/register")
      .set("X-Auth-Mode", "bearer")
      .send({ email, password: "password123", displayName: "Bearer User" });

    const login = await request(app)
      .post("/api/auth/login")
      .set("X-Auth-Mode", "bearer")
      .send({ email, password: "password123" });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe("string");
    expect(login.body.token.split(".")).toHaveLength(3);

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });
});
