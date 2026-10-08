import { afterAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { SESSION_COOKIE } from "../../src/modules/auth/sessionCookie.js";

const app = createApp();
const APP_ORIGIN = "http://localhost:5173";
let sequence = 0;

function sessionCookie(setCookie: string | string[] | undefined): string {
  const joined = (Array.isArray(setCookie) ? setCookie : [setCookie ?? ""]).join("\n");
  const match = joined.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  expect(match?.[1]).toBeTruthy();
  return `${SESSION_COOKIE}=${match?.[1]}`;
}

async function registerBearer(password = "password123") {
  sequence += 1;
  const email = `account-${Date.now()}-${sequence}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .set("X-Auth-Mode", "bearer")
    .send({ email, password, displayName: "Account Tester" });
  expect(res.status).toBe(201);
  expect(res.body.token).toEqual(expect.any(String));
  expect(res.body.user.passwordHash).toBeUndefined();
  expect(res.body.user.sessionVersion).toBeUndefined();
  return { email, password, token: res.body.token as string, userId: res.body.user.id as string };
}

afterAll(async () => {
  delete process.env.PASSWORD_RATE_LIMIT;
  await prisma.$disconnect();
});

describe("account password and sessions", () => {
  it("replaces the password and rejects tokens issued before the change", async () => {
    const account = await registerBearer();
    const otherLogin = await request(app)
      .post("/api/auth/login")
      .set("X-Auth-Mode", "bearer")
      .send({ email: account.email, password: account.password });
    expect(otherLogin.status).toBe(200);

    const changed = await request(app)
      .post("/api/auth/password")
      .set("X-Auth-Mode", "bearer")
      .set("Authorization", `Bearer ${account.token}`)
      .send({ current_password: account.password, new_password: "a-new-password" });
    expect(changed.status).toBe(200);
    expect(changed.body.token).toEqual(expect.any(String));
    expect(changed.body.token).not.toBe(account.token);
    expect(changed.body.user.email).toBe(account.email);
    expect(changed.body.user.passwordHash).toBeUndefined();
    expect(changed.body.user.sessionVersion).toBeUndefined();

    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${account.token}`)).status).toBe(401);
    expect(
      (await request(app).get("/api/auth/me").set("Authorization", `Bearer ${otherLogin.body.token}`)).status,
    ).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${changed.body.token}`)).status).toBe(
      200,
    );

    const oldPassword = await request(app)
      .post("/api/auth/login")
      .set("X-Auth-Mode", "bearer")
      .send({ email: account.email, password: account.password });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app)
      .post("/api/auth/login")
      .set("X-Auth-Mode", "bearer")
      .send({ email: account.email, password: "a-new-password" });
    expect(newPassword.status).toBe(200);
  });

  it("keeps the current session when the current password is wrong or unchanged", async () => {
    const account = await registerBearer();
    const wrong = await request(app)
      .post("/api/auth/password")
      .set("Authorization", `Bearer ${account.token}`)
      .send({ current_password: "not-the-password", new_password: "a-new-password" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe("That password is not the current one.");

    const same = await request(app)
      .post("/api/auth/password")
      .set("Authorization", `Bearer ${account.token}`)
      .send({ current_password: account.password, new_password: account.password });
    expect(same.status).toBe(400);
    expect(same.body.error).toBe("Choose a different password.");

    const still = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${account.token}`);
    expect(still.status).toBe(200);

    const legacy = jwt.sign({ sub: account.userId }, process.env.JWT_SECRET ?? "test-secret", { expiresIn: 60 });
    const rejected = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${legacy}`);
    expect(rejected.status).toBe(401);
    expect(rejected.body.error).toBe("Invalid or expired session");
  });

  it("requires the app origin for a cookie password change and drops the old cookie", async () => {
    const email = `account-cookie-${Date.now()}@example.com`;
    const agent = request.agent(app);
    const registered = await agent
      .post("/api/auth/register")
      .set("Origin", APP_ORIGIN)
      .send({ email, password: "password123", displayName: "Cookie Account" });
    expect(registered.status).toBe(201);
    const oldCookie = sessionCookie(registered.headers["set-cookie"]);

    const missingOrigin = await agent
      .post("/api/auth/password")
      .send({ current_password: "password123", new_password: "a-new-password" });
    expect(missingOrigin.status).toBe(403);
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    const changed = await agent
      .post("/api/auth/password")
      .set("Origin", APP_ORIGIN)
      .send({ current_password: "password123", new_password: "a-new-password" });
    expect(changed.status).toBe(200);
    expect(changed.body.token).toBeUndefined();
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    const stale = await request(app).get("/api/auth/me").set("Cookie", oldCookie);
    expect(stale.status).toBe(401);
    const staleSession = await request(app).get("/api/auth/session").set("Cookie", oldCookie);
    expect(staleSession.status).toBe(200);
    expect(staleSession.body.user).toBeNull();
  });

  it("signing out ends every session for the account", async () => {
    const account = await registerBearer();
    const second = await request(app)
      .post("/api/auth/login")
      .set("X-Auth-Mode", "bearer")
      .send({ email: account.email, password: account.password });
    expect(second.status).toBe(200);

    const loggedOut = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${account.token}`);
    expect(loggedOut.status).toBe(204);
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${account.token}`)).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${second.body.token}`)).status).toBe(
      401,
    );

    const again = await request(app)
      .post("/api/auth/login")
      .set("X-Auth-Mode", "bearer")
      .send({ email: account.email, password: account.password });
    expect(again.status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${again.body.token}`)).status).toBe(
      200,
    );
  });

  it("returns 429 after too many password attempts and does not block another account", async () => {
    process.env.PASSWORD_RATE_LIMIT = "2";
    const account = await registerBearer();
    const send = () =>
      request(app)
        .post("/api/auth/password")
        .set("Authorization", `Bearer ${account.token}`)
        .send({ current_password: "not-the-password", new_password: "a-new-password" });

    expect((await send()).status).toBe(401);
    expect((await send()).status).toBe(401);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    expect(blocked.body.error).toBe("Too many password attempts. Wait a minute and try again.");
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${account.token}`)).status).toBe(200);

    const other = await registerBearer();
    const allowed = await request(app)
      .post("/api/auth/password")
      .set("Authorization", `Bearer ${other.token}`)
      .send({ current_password: "not-the-password", new_password: "a-new-password" });
    expect(allowed.status).toBe(401);
    delete process.env.PASSWORD_RATE_LIMIT;
  });
});

describe("display name", () => {
  it("updates the name other collectors see without ending the session", async () => {
    const account = await registerBearer();
    const renamed = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${account.token}`)
      .send({ display_name: "  Harbor Guide  " });
    expect(renamed.status).toBe(200);
    expect(renamed.body.user.display_name).toBe("Harbor Guide");
    expect(renamed.body.user.email).toBe(account.email);
    expect(renamed.body.user.passwordHash).toBeUndefined();

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${account.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.display_name).toBe("Harbor Guide");

    const blank = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${account.token}`)
      .send({ display_name: "   " });
    expect(blank.status).toBe(400);

    const extra = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${account.token}`)
      .send({ display_name: "Nope", email: "other@example.com" });
    expect(extra.status).toBe(400);
    expect(
      (await request(app).get("/api/auth/me").set("Authorization", `Bearer ${account.token}`)).body.user.email,
    ).toBe(account.email);
  });
});
