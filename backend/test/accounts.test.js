import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

// Never load a real product database for integration tests.
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DB_DATABASE !== "fussy_panda_1a_test" ||
  !process.env.DB_SOCKET?.startsWith("/tmp/fussy-panda-mysql-1a-")
) {
  throw new Error(
    "Tests require NODE_ENV=test, DB_DATABASE=fussy_panda_1a_test and an isolated /tmp/fussy-panda-mysql-1a- Unix socket",
  );
}
const { createApp } = await import("../server.js");
const { sequelize, User, PasswordResetToken } =
  await import("../models/index.js");

test("independent account lifecycle and recovery against migrated MySQL", async (t) => {
  process.env.SIGNUP_NOTIFICATION_EMAIL = "owner@example.com";
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const deliveries = [];
  const originalInfo = console.info;
  console.info = (...args) => {
    if (args[0] === "Fussy Panda development email:") deliveries.push(args[1]);
  };
  t.after(async () => {
    console.info = originalInfo;
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  });
  const email = `test-${crypto.randomUUID()}@example.com`;
  const oldPassword = "Original123!";
  async function request(
    path,
    { method = "GET", body, token, cookie, origin } = {},
  ) {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    const response = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  }
  await t.test(
    "schema contains only account tables and migration history",
    async () => {
      const tables = await sequelize.getQueryInterface().showAllTables();
      assert.deepEqual(
        tables.sort(),
        [
          "SequelizeMeta",
          "passwordResetTokens",
          "users",
          "photoStudioEnvironments",
          "photoStudioGenerations",
          "photoStudioChats",
          "photoStudioMessages",
          "photoStudioGenerationAttempts",
          "photoStudioPhotos",
          "photoStudioSubscriptions",
          "photoStudioCreditBuckets",
          "photoStudioCreditLedgerEntries",
          "stripeWebhookEvents",
          "guestSessions",
          "photoStudioFiles",
        ].sort(),
      );
    },
  );
  await t.test("health and protected access", async () => {
    assert.equal((await request("/health")).status, 200);
    assert.equal((await request("/api/user")).status, 401);
    assert.equal((await request("/api/menu")).status, 404);
    const config = await request("/api/auth/config");
    assert.deepEqual(config.data, { googleClientId: null });
  });
  let session;
  await t.test(
    "signup validates passwords and creates a studio-only user with signup credits",
    async () => {
      assert.equal(
        (
          await request("/api/user/register", {
            method: "POST",
            body: { email, password: "weak" },
          })
        ).status,
        400,
      );
      session = await request("/api/user/register", {
        method: "POST",
        body: {
          email: email.toUpperCase(),
          password: oldPassword,
          ownerName: "Test User",
        },
      });
      assert.equal(session.status, 201);
      assert.equal(session.data.user.email, email);
      assert.equal(session.data.user.accountType, "photo_studio");
      assert.equal(session.data.user.password, undefined);
      assert.equal(session.data.user.tokenVersion, undefined);
      assert.equal(session.data.user.restaurantName, undefined);
      assert.match(session.cookie, /^fp_session=/);
      assert.match(session.cookie, /HttpOnly/);
      const user = await User.findByPk(session.data.user.id);
      assert.notEqual(user.password, oldPassword);
      assert.equal(await user.checkPassword(oldPassword), true);
      assert.equal(deliveries.filter(item => item.subject === "Welcome to Fussy Panda").length, 1);
      const notification = deliveries.find(item => item.subject === "New Fussy Panda signup");
      assert.equal(notification.to, "owner@example.com");
      assert.match(notification.text, new RegExp(email));
      assert.equal(
        (
          await request("/api/user/register", {
            method: "POST",
            body: { email, password: oldPassword },
          })
        ).status,
        409,
      );
      assert.equal(deliveries.filter(item => item.subject === "New Fussy Panda signup").length, 1);
    },
  );
  await t.test(
    "cookie persistence, bearer authentication and product isolation",
    async () => {
      assert.equal(
        (await request("/api/user", { cookie: session.cookie.split(";")[0] }))
          .status,
        200,
      );
      assert.equal(
        (await request("/api/user", { token: session.data.token })).status,
        200,
      );
      assert.equal(
        (
          await request("/api/user", {
            cookie: `session=${session.data.token}`,
          })
        ).status,
        401,
      );
      const foreignToken = jwt.sign(
        { id: session.data.user.id },
        process.env.JWT_SECRET,
      );
      assert.equal(
        (await request("/api/user", { token: foreignToken })).status,
        401,
      );
      const foreignSecretToken = jwt.sign(
        { id: session.data.user.id, version: 0 },
        "another-product-secret",
        {
          issuer: "fussy-panda",
          audience: "fussy-panda-backend",
        },
      );
      assert.equal(
        (await request("/api/user", { token: foreignSecretToken })).status,
        401,
      );
      assert.equal(
        (
          await request("/api/user/login", {
            method: "POST",
            body: { email, password: oldPassword },
            origin: "https://whats-good.co.uk",
          })
        ).status,
        403,
      );
    },
  );
  await t.test("profile only permits account fields", async () => {
    assert.equal(
      (
        await request("/api/user", {
          method: "PATCH",
          token: session.data.token,
          body: { accountType: "menu" },
        })
      ).status,
      400,
    );
    const changed = await request("/api/user", {
      method: "PATCH",
      token: session.data.token,
      body: { ownerName: "Updated" },
    });
    assert.equal(changed.data.user.ownerName, "Updated");
  });
  await t.test("login errors, logout revocation and fresh login", async () => {
    assert.equal(
      (
        await request("/api/user/login", {
          method: "POST",
          body: { email, password: "wrong" },
        })
      ).status,
      401,
    );
    const loggedIn = await request("/api/user/login", {
      method: "POST",
      body: { email, password: oldPassword },
    });
    assert.equal(loggedIn.status, 200);
    const logout = await request("/api/user/logout", {
      method: "POST",
      cookie: loggedIn.cookie.split(";")[0],
    });
    assert.equal(logout.status, 200);
    assert.match(logout.cookie, /Expires=Thu, 01 Jan 1970/);
    assert.equal(
      (await request("/api/user", { token: loggedIn.data.token })).status,
      401,
    );
    assert.equal(
      (await request("/api/user", { token: session.data.token })).status,
      401,
    );
    session = await request("/api/user/login", {
      method: "POST",
      body: { email, password: oldPassword },
    });
    assert.equal(session.status, 200);
    assert.equal(deliveries.filter(item => item.subject === "New Fussy Panda signup").length, 1);
  });
  await t.test(
    "reset links are branded, single-use, expire, and invalidate sessions",
    async () => {
      const missing = await request("/api/auth/forgot-password", {
        method: "POST",
        body: { email: "missing@example.com" },
      });
      const existing = await request("/api/auth/forgot-password", {
        method: "POST",
        body: { email },
      });
      assert.deepEqual(missing.data, existing.data);
      const message = deliveries.findLast(
        (item) => item.subject === "Reset your Fussy Panda password",
      );
      assert.ok(message);
      const url = new URL(message.text.match(/https?:\/\/\S+/)[0]);
      assert.equal(url.origin, process.env.FRONTEND_URL);
      assert.equal(url.pathname, "/auth/password-update");
      const token = url.searchParams.get("token");
      const stored = await PasswordResetToken.findOne({
        where: { userId: session.data.user.id, usedAt: null },
      });
      assert.notEqual(stored.tokenHash, token);
      await stored.update({ expiresAt: new Date(Date.now() - 1000) });
      assert.equal(
        (
          await request("/api/auth/reset-password", {
            method: "POST",
            body: { token, password: "NewPassword123!" },
          })
        ).status,
        400,
      );
      await request("/api/auth/forgot-password", {
        method: "POST",
        body: { email },
      });
      const freshToken = new URL(
        deliveries
          .findLast((item) => item.subject === message.subject)
          .text.match(/https?:\/\/\S+/)[0],
      ).searchParams.get("token");
      const body = { token: freshToken, password: "NewPassword123!" };
      const concurrent = await Promise.all([
        request("/api/auth/reset-password", { method: "POST", body }),
        request("/api/auth/reset-password", { method: "POST", body }),
      ]);
      assert.deepEqual(
        concurrent.map((item) => item.status).sort(),
        [200, 400],
      );
      assert.equal(
        (await request("/api/user", { token: session.data.token })).status,
        401,
      );
      assert.equal(
        (
          await request("/api/user/login", {
            method: "POST",
            body: { email, password: oldPassword },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request("/api/user/login", {
            method: "POST",
            body: { email, password: body.password },
          })
        ).status,
        200,
      );
    },
  );
  await t.test("Google login reports missing configuration", async () => {
    assert.equal(
      (
        await request("/api/user/oauth/google", {
          method: "POST",
          body: { credential: "invalid" },
        })
      ).status,
      503,
    );
  });
});
