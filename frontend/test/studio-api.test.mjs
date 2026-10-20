import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// Compile the actual frontend modules in memory, without adding a browser/test runtime dependency.
const compile = (file) =>
  ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const moduleUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const apiUrl = moduleUrl(compile("../lib/api.ts"));
const { studioApi, downloadOriginal, studioError } = await import(
  moduleUrl(
    compile("../lib/studio-api.ts").replace('from "./api"', `from "${apiUrl}"`),
  )
);
const { ApiError } = await import(apiUrl);

test("reading studio status never creates or replaces a trial", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json({ studio: { remainingTrialTokens: 0 } });
  });
  const response = await studioApi.session();
  assert.equal(response.studio.remainingTrialTokens, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, undefined);
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.headers["X-Fussy-Panda-CSRF"], "1");
  await studioApi.startTrial();
  assert.equal(calls[1].options.method, "POST");
});

test("studio failures remain visible without automatic trial or generation retries", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(
      { code: "GUEST_SESSION_EXPIRED", message: "Trial expired" },
      { status: 410 },
    );
  });
  await assert.rejects(
    studioApi.session(),
    (error) =>
      error instanceof ApiError && error.data.code === "GUEST_SESSION_EXPIRED",
  );
  assert.equal(calls, 1);
});

test("generation allows provider work to finish and submits each instruction once", async (t) => {
  const timeouts = [];
  const originalTimeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    timeouts.push(milliseconds);
    return originalTimeout(milliseconds);
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json({ studio: { availableTokens: 4 } });
  });
  await studioApi.generate("chat/one", "Warm the lighting");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/api/photoStudioChats/chat%2Fone/messages"));
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    instruction: "Warm the lighting",
  });
  assert.ok(timeouts[0] > 300000);
});

test("original downloads require a fresh ownership-checked URL and omit session cookies to storage", async (t) => {
  const calls = [];
  let clicked = 0;
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      click() {
        clicked++;
      },
      remove() {},
    }),
    body: { appendChild() {} },
  };
  t.after(() => {
    globalThis.document = originalDocument;
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/download"))
      return Response.json({
        download: {
          url: "https://storage.example/original?token=fixture",
          expiresIn: 60,
        },
      });
    return new Response(new Blob(["original"], { type: "image/png" }));
  });
  t.mock.method(URL, "createObjectURL", () => "blob:fixture");
  t.mock.method(URL, "revokeObjectURL", () => {});
  await downloadOriginal(
    "/api/photoStudio/library/owned-photo/download",
    "dish.png",
  );
  assert.ok(
    calls[0].url.endsWith("/api/photoStudio/library/owned-photo/download"),
  );
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[1].options.credentials, "omit");
  assert.equal(calls[1].options.referrerPolicy, "no-referrer");
  assert.equal(clicked, 1);
  await downloadOriginal(
    "/api/photoStudio/library/owned-photo/download",
    "dish.png",
  );
  assert.equal(
    calls.filter((call) => call.url.includes("/download")).length,
    2,
  );
});

test("download denial never falls back to a public preview", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(
      { message: "Log in to download originals" },
      { status: 401 },
    );
  });
  await assert.rejects(
    downloadOriginal("/api/photoStudio/library/private/download", "dish.png"),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(calls, 1);
});

test("provider configuration errors are not presented as implementation details", () => {
  assert.equal(
    studioError(
      new ApiError(503, { message: "Missing internal environment variable" }),
    ),
    "Photo Studio is temporarily unavailable. Please try again later.",
  );
  assert.match(studioError(new ApiError(429, {})), /wait/);
});
