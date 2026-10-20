import crypto from "node:crypto";
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DB_DATABASE !== "fussy_panda_1a_test" ||
  !process.env.DB_SOCKET?.startsWith("/tmp/fussy-panda-mysql-1a-")
)
  throw new Error(
    "Integration tests require an isolated Step 1A/1B test database",
  );
export async function api(t) {
  const { createApp } = await import("../server.js");
  const { sequelize } = await import("../models/index.js");
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(
    path,
    { method = "GET", body, token, cookie, headers = {}, raw } = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body || raw ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie
          ? {
              Cookie: cookie,
              Origin: process.env.FRONTEND_URL,
              "X-Fussy-Panda-CSRF": "1",
            }
          : {}),
        ...headers,
      },
      body: raw || (body ? JSON.stringify(body) : undefined),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  }
  async function signup() {
    const result = await request("/api/user/register", {
      method: "POST",
      body: {
        email: `test-${crypto.randomUUID()}@example.com`,
        password: "Original123!",
      },
    });
    if (result.status !== 201) throw new Error("Test signup failed");
    return { user: result.data.user, token: result.data.token };
  }
  return { request, signup };
}
