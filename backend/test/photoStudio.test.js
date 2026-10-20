import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import sharp from "sharp";
import { api } from "./helpers.js";
const image = await sharp({
  create: { width: 128, height: 128, channels: 3, background: "#bca082" },
})
  .png()
  .toBuffer();
const dataUrl = `data:image/png;base64,${image.toString("base64")}`;
const { storageFixture } = await import("./storageFixture.js");
const { objects, storage } = storageFixture();
process.env.SUPABASE_STORAGE_BUCKET = "fussy-panda-test-legacy";
process.env.SUPABASE_PRIVATE_STORAGE_BUCKET = "fussy-panda-test-private";
process.env.SUPABASE_PREVIEW_STORAGE_BUCKET = "fussy-panda-test-preview";
mock.module("../lib/supabase.js", { defaultExport: { storage } });
let failGeneration = false;
let qaPass = true;
let qaFailures = 0;
let generatingGate;
mock.module("../lib/photoStudioGeneration.js", {
  namedExports: {
    async generatePhotoStudioComposite() {
      if (failGeneration) throw new Error("Test provider failure");
      return image.toString("base64");
    },
  },
});
mock.module("../lib/photoStudioAgentGeneration.js", {
  namedExports: {
    PHOTO_STUDIO_AGENT_IMAGE_MODEL: "test-image",
    async generatePhotoStudioAgentImage() {
      if (generatingGate) await generatingGate;
      if (failGeneration) throw new Error("Test provider failure");
      return { imageBase64: image.toString("base64"), model: "test-image" };
    },
  },
});
mock.module("../lib/photoGenerationQa.js", {
  namedExports: {
    async evaluateGeneratedFoodImage() {
      const passed = qaPass && qaFailures-- <= 0;
      return {
        passed,
        score: passed ? 95 : 30,
        issues: passed ? [] : ["Lighting"],
        retryPrompt: "Improve lighting",
      };
    },
  },
});
let googlePayload;
mock.module("google-auth-library", {
  namedExports: {
    OAuth2Client: class {
      async verifyIdToken() {
        return { getPayload: () => googlePayload };
      }
    },
  },
});
const models = await import("../models/index.js");
const credits = await import("../lib/photoStudioCredits.js");
const cleanup = await import("../lib/photoStudioCleanup.js");
test("Photo Studio lifecycle, credits, ownership and recovery", async (t) => {
  const { request, signup } = await api(t);
  const a = await signup(),
    b = await signup();
  const token = a.token;
  await t.test(
    "signup grants once and studio routes require authentication",
    async () => {
      assert.equal((await request("/api/photoStudioCredits")).status, 401);
      assert.equal((await request("/api/photoStudioChats")).status, 401);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          credits.ensurePhotoStudioSignupCredits({ userId: a.user.id }),
        ),
      );
      assert.equal(new Set(results.map((item) => item.id)).size, 1);
      assert.deepEqual(
        (await request("/api/photoStudioCredits", { token })).data.credits,
        { permanent: 25, monthly: 0, available: 25 },
      );
      assert.equal(
        await models.PhotoStudioCreditLedgerEntry.count({
          where: { userId: a.user.id, type: "grant" },
        }),
        1,
      );
    },
  );
  await t.test(
    "verified Google signup gets credits; existing local account cannot be linked",
    async () => {
      process.env.GOOGLE_CLIENT_ID = "test-google-client";
      googlePayload = {
        sub: crypto.randomUUID(),
        email: `google-${crypto.randomUUID()}@example.com`,
        email_verified: false,
      };
      assert.equal(
        (
          await request("/api/user/oauth/google", {
            method: "POST",
            body: { credential: "test" },
          })
        ).status,
        401,
      );
      googlePayload.email_verified = true;
      const created = await request("/api/user/oauth/google", {
        method: "POST",
        body: { credential: "test" },
      });
      assert.equal(created.status, 200);
      assert.equal(
        (
          await credits.getPhotoStudioCreditSummary({
            userId: created.data.user.id,
          })
        ).available,
        25,
      );
      const again = await request("/api/user/oauth/google", {
        method: "POST",
        body: { credential: "test" },
      });
      assert.equal(again.data.user.id, created.data.user.id);
      assert.equal(
        await models.PhotoStudioCreditBucket.count({
          where: { userId: created.data.user.id },
        }),
        1,
      );
      googlePayload = {
        ...googlePayload,
        sub: crypto.randomUUID(),
        email: a.user.email,
      };
      assert.equal(
        (
          await request("/api/user/oauth/google", {
            method: "POST",
            body: { credential: "test" },
          })
        ).status,
        409,
      );
      delete process.env.GOOGLE_CLIENT_ID;
    },
  );
  await t.test(
    "image validation and Fussy Panda storage ownership",
    async () => {
      assert.equal(
        (
          await request("/api/photoStudio/environment", {
            method: "PUT",
            token,
            body: { environmentPhotoDataUrl: "bad" },
          })
        ).status,
        400,
      );
      const response = await request("/api/photoStudio/environment", {
        method: "PUT",
        token,
        body: { environmentPhotoDataUrl: dataUrl },
      });
      assert.equal(response.status, 201);
      assert.ok(
        (
          await models.PhotoStudioEnvironment.findByPk(
            response.data.environment.id,
          )
        ).storagePath.startsWith(
          `private/fussy-panda/accounts/${a.user.id}/photo-studio/`,
        ),
      );
      const { copyGeneratedPhotoToLibrary, removePhotoStudioPaths } =
        await import("../lib/photoStudioStorage.js");
      await assert.rejects(
        copyGeneratedPhotoToLibrary({
          account: b.user,
          generatedStoragePath: (
            await models.PhotoStudioEnvironment.findByPk(
              response.data.environment.id,
            )
          ).storagePath,
        }),
      );
      await removePhotoStudioPaths({
        account: b.user,
        storagePaths: [
          (
            await models.PhotoStudioEnvironment.findByPk(
              response.data.environment.id,
            )
          ).storagePath,
        ],
      });
      assert.ok(
        objects.has(
          (
            await models.PhotoStudioEnvironment.findByPk(
              response.data.environment.id,
            )
          ).storagePath,
        ),
      );
    },
  );
  let generationId, photoId;
  await t.test(
    "direct generation consumes once; library saves are idempotent and owner-scoped",
    async () => {
      const generated = await request("/api/photoStudio/generations", {
        method: "POST",
        token,
        body: { sourcePhotoDataUrl: dataUrl },
      });
      assert.equal(generated.status, 201);
      generationId = generated.data.generation.id;
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId: a.user.id }))
          .available,
        24,
      );
      assert.equal(
        (
          await request(
            `/api/photoStudio/generations/${generationId}/library`,
            { method: "POST", token: b.token },
          )
        ).status,
        404,
      );
      const saved = await request(
        `/api/photoStudio/generations/${generationId}/library`,
        { method: "POST", token },
      );
      assert.equal(saved.status, 201);
      photoId = saved.data.photo.id;
      assert.equal(
        (
          await request(
            `/api/photoStudio/generations/${generationId}/library`,
            { method: "POST", token },
          )
        ).data.photo.id,
        photoId,
      );
      assert.equal(
        (await request("/api/photoStudio/library", { token: b.token })).data
          .photos.length,
        0,
      );
      assert.equal(
        (
          await request(`/api/photoStudio/library/${photoId}`, {
            method: "DELETE",
            token: b.token,
          })
        ).status,
        404,
      );
    },
  );
  await t.test("failed generation releases its reservation", async () => {
    failGeneration = true;
    assert.equal(
      (
        await request("/api/photoStudio/generations", {
          method: "POST",
          token,
          body: { sourcePhotoDataUrl: dataUrl },
        })
      ).status,
      500,
    );
    failGeneration = false;
    assert.equal(
      (await credits.getPhotoStudioCreditSummary({ userId: a.user.id }))
        .available,
      24,
    );
    const bucket = await models.PhotoStudioCreditBucket.findOne({
      where: { userId: a.user.id },
    });
    assert.equal(bucket.reserved, 0);
  });
  let chatId, messageId, libraryPath;
  await t.test(
    "chat creation, quality retry and successful generation consume one credit",
    async () => {
      const created = await request("/api/photoStudioChats", {
        method: "POST",
        token,
        body: { sourcePhotoDataUrl: dataUrl },
      });
      assert.equal(created.status, 201);
      chatId = created.data.chat.id;
      assert.equal(
        (await request(`/api/photoStudioChats/${chatId}`, { token: b.token }))
          .status,
        404,
      );
      qaFailures = 1;
      const response = await request(
        `/api/photoStudioChats/${chatId}/messages`,
        { method: "POST", token, body: {} },
      );
      assert.equal(response.status, 201);
      messageId = response.data.agentMessage.id;
      assert.equal(response.data.credits.available, 23);
      assert.equal(
        await models.PhotoStudioGenerationAttempt.count({
          where: { agentMessageId: messageId },
        }),
        2,
      );
      const saved = await request(
        `/api/photoStudioChats/${chatId}/messages/${messageId}/library`,
        { method: "POST", token },
      );
      assert.equal(saved.status, 201);
      libraryPath = (
        await models.PhotoStudioPhoto.findByPk(saved.data.photo.id)
      ).storagePath;
      const repeated = await Promise.all([
        request(
          `/api/photoStudioChats/${chatId}/messages/${messageId}/library`,
          { method: "POST", token },
        ),
        request(
          `/api/photoStudioChats/${chatId}/messages/${messageId}/library`,
          { method: "POST", token },
        ),
      ]);
      assert.ok(
        repeated.every(
          (result) =>
            result.status === 200 &&
            result.data.photo.id === saved.data.photo.id,
        ),
      );
    },
  );
  await t.test(
    "chat failure returns credit; concurrent generation and deletion are blocked",
    async () => {
      qaPass = false;
      assert.equal(
        (
          await request(`/api/photoStudioChats/${chatId}/messages`, {
            method: "POST",
            token,
            body: { instruction: "Improve lighting" },
          })
        ).status,
        502,
      );
      qaPass = true;
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId: a.user.id }))
          .available,
        23,
      );
      let release;
      generatingGate = new Promise((resolve) => {
        release = resolve;
      });
      const first = request(`/api/photoStudioChats/${chatId}/messages`, {
        method: "POST",
        token,
        body: { instruction: "Improve lighting" },
      });
      // Wait for the durable reservation, not elapsed time alone.
      for (let i = 0; i < 100; i++) {
        if (
          await models.PhotoStudioMessage.count({
            where: { chatId, status: "generating" },
          })
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(
        (
          await request(`/api/photoStudioChats/${chatId}/messages`, {
            method: "POST",
            token,
            body: { instruction: "Improve lighting" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(`/api/photoStudioChats/${chatId}`, {
            method: "DELETE",
            token,
          })
        ).status,
        409,
      );
      release();
      generatingGate = null;
      assert.equal((await first).status, 201);
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId: a.user.id }))
          .available,
        22,
      );
    },
  );
  await t.test("chat deletion preserves permanent library photos", async () => {
    assert.equal(
      (
        await request(`/api/photoStudioChats/${chatId}`, {
          method: "DELETE",
          token,
        })
      ).status,
      200,
    );
    const saved = await models.PhotoStudioPhoto.findOne({
      where: { storagePath: libraryPath },
    });
    assert.equal(saved.messageId, null);
    assert.ok(objects.has(libraryPath));
  });
  await t.test(
    "concurrent credit reservation cannot overspend; terminal operations are idempotent",
    async () => {
      const bucket = await models.PhotoStudioCreditBucket.findOne({
        where: { userId: b.user.id },
      });
      await bucket.update({ remaining: 1 });
      const results = await Promise.allSettled([
        credits.reservePhotoStudioCredit({ userId: b.user.id }),
        credits.reservePhotoStudioCredit({ userId: b.user.id }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const operationId = results.find((r) => r.status === "fulfilled").value
        .operationId;
      await assert.rejects(
        credits.consumePhotoStudioCredit({ userId: a.user.id, operationId }),
      );
      const consumed = await Promise.all([
        credits.consumePhotoStudioCredit({ userId: b.user.id, operationId }),
        credits.consumePhotoStudioCredit({ userId: b.user.id, operationId }),
      ]);
      assert.equal(consumed.filter((r) => r.consumed).length, 1);
      await assert.rejects(
        credits.releasePhotoStudioCredit({ userId: b.user.id, operationId }),
      );
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId: b.user.id }))
          .available,
        0,
      );
      await models.PhotoStudioEnvironment.create({
        userId: b.user.id,
        imageUrl: "https://example.com/environment",
        storagePath: "unused",
      });
      assert.equal(
        (
          await request("/api/photoStudio/generations", {
            method: "POST",
            token: b.token,
            body: { sourcePhotoDataUrl: dataUrl },
          })
        ).status,
        402,
      );
      assert.equal(
        (
          await request(
            `/api/photoStudioChats/${crypto.randomUUID()}/messages`,
            { method: "POST", token: b.token, body: {} },
          )
        ).status,
        404,
      );
    },
  );
  await t.test(
    "five-chat limit is enforced for simultaneous requests",
    async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          request("/api/photoStudioChats", {
            method: "POST",
            token,
            body: { sourcePhotoDataUrl: dataUrl },
          }),
        ),
      );
      assert.equal(results.filter((result) => result.status === 201).length, 5);
      assert.equal(results.filter((result) => result.status === 409).length, 1);
      for (const result of results.filter((result) => result.status === 201)) {
        assert.equal(
          (
            await request(`/api/photoStudioChats/${result.data.chat.id}`, {
              method: "DELETE",
              token,
            })
          ).status,
          200,
        );
      }
    },
  );
  await t.test(
    "cleanup restores abandoned credits and removes saved temporary objects",
    async () => {
      const environment = await models.PhotoStudioEnvironment.findOne({
        where: { userId: a.user.id },
      });
      const reservation = await credits.reservePhotoStudioCredit({
        userId: a.user.id,
      });
      const abandoned = await models.PhotoStudioGeneration.create({
        userId: a.user.id,
        environmentId: environment.id,
        status: "generating",
        creditOperationId: reservation.operationId,
      });
      await models.sequelize.query(
        "UPDATE photoStudioGenerations SET updatedAt = DATE_SUB(NOW(), INTERVAL 2 HOUR) WHERE id = ?",
        { replacements: [abandoned.id] },
      );
      assert.ok((await cleanup.cleanupAbandonedPhotoStudioGenerations()) >= 1);
      assert.equal(
        await models.PhotoStudioGeneration.findByPk(abandoned.id),
        null,
      );
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId: a.user.id }))
          .available,
        22,
      );
      const saved = await models.PhotoStudioGeneration.findByPk(generationId);
      assert.equal(saved.generatedStoragePath, null);
      const chat = await models.PhotoStudioChat.create({
        userId: a.user.id,
        title: "Recovery",
        status: "active",
        sourceImageUrl: "https://example.com/source",
        sourceStoragePath: "unused",
        environmentImageUrl: "https://example.com/environment",
        environmentStoragePath: "unused",
      });
      const message = await models.PhotoStudioMessage.create({
        chatId: chat.id,
        role: "agent",
        type: "generated_image",
        status: "generating",
        sequence: 1,
      });
      const reserved = await credits.reservePhotoStudioCredit({
        userId: a.user.id,
        chatId: chat.id,
        agentMessageId: message.id,
      });
      await message.update({ creditOperationId: reserved.operationId });
      await models.sequelize.query(
        "UPDATE photoStudioMessages SET updatedAt = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?",
        { replacements: [message.id] },
      );
      assert.equal(
        await cleanup.cleanupAbandonedPhotoStudioChatGenerations(),
        1,
      );
      assert.equal((await message.reload()).status, "failed");
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId: a.user.id }))
          .available,
        22,
      );
    },
  );
});
