import { sharedGuestGenerationLimiter } from "../../../lib/guestSecurity.js";
import {
  ownerWhere,
  creditOwner,
  lockStudioOwner,
} from "../../../lib/studioOwner.js";
import { sendStudio, studioStatus } from "../../../lib/studioResponse.js";
import {
  referenceImageUrl,
  originalDownloadUrl,
} from "../../../lib/photoStudioStorage.js";
import { guestHeartbeat } from "../../../lib/guestTrial.js";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  PhotoStudioEnvironment as Environment,
  PhotoStudioGeneration as Generation,
  PhotoStudioPhoto as Photo,
  User,
  sequelize,
} from "../../../models/index.js";
import {
  requirePhotoStudioAccess,
  requireStudioAccount,
} from "../../../lib/photoStudioAccessGuard.js";
import {
  reservePhotoStudioCredit,
  consumePhotoStudioCredit,
  releasePhotoStudioCredit,
} from "../../../lib/photoStudioCredits.js";
import {
  savePhotoStudioEnvironment,
  saveTemporaryPhotoStudioSource,
  saveTemporaryGeneratedPhoto,
  copyGeneratedPhotoToLibrary,
  removePhotoStudioPaths,
} from "../../../lib/photoStudioStorage.js";
import { generatePhotoStudioComposite } from "../../../lib/photoStudioGeneration.js";
const router = Router();
router.use(requirePhotoStudioAccess);
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const problem = (message, status) =>
  Object.assign(new Error(message), { status });
const owned = (Model, id, actor, transaction) =>
  Model.findOne({
    where: { id, ...(Model === Photo ? { userId: actor.id } : ownerWhere(actor)) },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
async function remove(user, paths, transaction) {
  await removePhotoStudioPaths({
    account: user,
    storagePaths: paths,
    transaction,
  });
}
async function safelyRemove(user, paths) {
  try {
    await remove(user, paths);
  } catch {
    console.error("Photo Studio storage cleanup must be retried");
  }
}
router.get("/environment", async (req, res) =>
  sendStudio(res, req.auth.user, {
    environment: await Environment.findOne({
      where: { ...ownerWhere(req.auth.user) },
      order: [["updatedAt", "DESC"]],
    }),
  }),
);
router.put("/environment", async (req, res) => {
  const user = req.auth.user;
  if (!req.body?.environmentPhotoDataUrl)
    throw problem("environmentPhotoDataUrl is required", 400);
  const image = await savePhotoStudioEnvironment({
    account: user,
    dataUrl: req.body.environmentPhotoDataUrl,
  });
  let previous;
  let created = false;
  let environment;
  try {
    environment = await sequelize.transaction(async (transaction) => {
      await lockStudioOwner(user, transaction);
      let record = await Environment.findOne({
        where: { ...ownerWhere(user) },
        order: [["updatedAt", "DESC"]],
        transaction,
      });
      previous = record?.storagePath;
      if (record) return record.update(image, { transaction });
      created = true;
      return Environment.create(
        { ...ownerWhere(user), ...image },
        { transaction },
      );
    });
  } catch (error) {
    await safelyRemove(user, [image.storagePath]);
    throw error;
  }
  if (previous) await safelyRemove(user, [previous]);
  return sendStudio(res, req.auth.user, { environment }, created ? 201 : 200);
});
async function runGenerationImpl(user, generation, environment, sourceDataUrl) {
  let generated;
  try {
    if (sourceDataUrl) {
      const source = await saveTemporaryPhotoStudioSource({
        account: user,
        generationId: generation.id,
        dataUrl: sourceDataUrl,
      });
      try {
        await generation.update({
          sourceImageUrl: source.imageUrl,
          sourceStoragePath: source.storagePath,
        });
      } catch (error) {
        await safelyRemove(user, [source.storagePath]);
        throw error;
      }
    }
    const imageBase64 = await generatePhotoStudioComposite({
      environmentImageUrl:
        (await referenceImageUrl(
          environment?.storagePath,
          environment?.imageUrl,
        )) ||
        (await referenceImageUrl(
          generation.sourceStoragePath,
          generation.sourceImageUrl,
        )),
      sourceImageUrl: await referenceImageUrl(
        generation.sourceStoragePath,
        generation.sourceImageUrl,
      ),
      userId: user.id,
    });
    generated = await saveTemporaryGeneratedPhoto({
      account: user,
      generationId: generation.id,
      imageBase64,
    });
    await sequelize.transaction(async (transaction) => {
      await lockStudioOwner(user, transaction, { completing: true });
      const record = await owned(Generation, generation.id, user, transaction);
      if (
        !record ||
        record.status !== "generating" ||
        record.creditOperationId !== generation.creditOperationId
      )
        throw problem("Generation is no longer active", 409);
      await consumePhotoStudioCredit({
        ...ownerWhere(user),
        operationId: record.creditOperationId,
        transaction,
      });
      await record.update(
        {
          status: "generated",
          generatedImageUrl: generated.imageUrl,
          generatedStoragePath: generated.storagePath,
          generatedAt: new Date(),
          errorMessage: null,
        },
        { transaction },
      );
    });
    return generation.reload();
  } catch (error) {
    if (generated) await safelyRemove(user, [generated.storagePath]);
    await sequelize.transaction(async (transaction) => {
      await lockStudioOwner(user, transaction, { completing: true });
      const record = await owned(Generation, generation.id, user, transaction);
      if (
        record?.status === "generating" &&
        record.creditOperationId === generation.creditOperationId
      ) {
        await releasePhotoStudioCredit({
          ...ownerWhere(user),
          operationId: record.creditOperationId,
          transaction,
        });
        await record.update(
          {
            status: "failed",
            errorMessage: "Generation failed; please try again",
          },
          { transaction },
        );
      }
    });
    throw error;
  }
}
async function runGeneration(...args) {
  const stop = guestHeartbeat(args[0]);
  try {
    return await runGenerationImpl(...args);
  } finally {
    stop();
  }
}
router.post(
  "/generations",
  sharedGuestGenerationLimiter,
  limiter,
  async (req, res) => {
    const user = req.auth.user;
    if (!req.body?.sourcePhotoDataUrl)
      throw problem("sourcePhotoDataUrl is required", 400);
    const environment = await Environment.findOne({
      where: { ...ownerWhere(user) },
    });

    const generation = await sequelize.transaction(async (transaction) => {
      const credit = await reservePhotoStudioCredit({
        ...ownerWhere(user),
        transaction,
      });
      return Generation.create(
        {
          ...ownerWhere(user),
          environmentId: environment?.id || null,
          status: "generating",
          creditOperationId: credit.operationId,
        },
        { transaction },
      );
    });
    return sendStudio(
      res,
      req.auth.user,
      {
        generation: await runGeneration(
          user,
          generation,
          environment,
          req.body.sourcePhotoDataUrl,
        ),
      },
      201,
    );
  },
);
router.post(
  "/generations/:id/redo",
  sharedGuestGenerationLimiter,
  limiter,
  async (req, res) => {
    const user = req.auth.user;
    let environment;
    let oldPath;
    const generation = await sequelize.transaction(async (transaction) => {
      await lockStudioOwner(user, transaction);
      const record = await owned(Generation, req.params.id, user, transaction);
      if (!record)
        throw Object.assign(problem("Generation not found", 404), {
          code: "OWNERSHIP_VIOLATION",
        });
      if (["generating", "saved"].includes(record.status))
        throw problem("This generation cannot be redone", 409);
      if (!record.sourceImageUrl)
        throw problem("Generation has no source photo", 400);
      environment = record.environmentId
        ? await owned(Environment, record.environmentId, user, transaction)
        : null;

      const credit = await reservePhotoStudioCredit({
        ...ownerWhere(user),
        transaction,
      });
      oldPath = record.generatedStoragePath;
      return record.update(
        {
          status: "generating",
          creditOperationId: credit.operationId,
          generatedImageUrl: null,
          generatedStoragePath: null,
          generatedAt: null,
          errorMessage: null,
          retryCount: record.retryCount + 1,
        },
        { transaction },
      );
    });
    // The same temporary object name is reused; removal failure must release the reservation too.
    try {
      if (oldPath) await remove(user, [oldPath]);
    } catch (error) {
      await sequelize.transaction(async (transaction) => {
        await lockStudioOwner(user, transaction);
        const record = await owned(
          Generation,
          generation.id,
          user,
          transaction,
        );
        await releasePhotoStudioCredit({
          ...ownerWhere(user),
          operationId: generation.creditOperationId,
          transaction,
        });
        await record.update(
          { status: "failed", generatedStoragePath: oldPath },
          { transaction },
        );
      });
      throw error;
    }
    return sendStudio(res, req.auth.user, {
      generation: await runGeneration(user, generation, environment),
    });
  },
);
router.delete("/generations/:id", async (req, res) => {
  const user = req.auth.user;
  await sequelize.transaction(async (transaction) => {
    await lockStudioOwner(user, transaction);
    const record = await owned(Generation, req.params.id, user, transaction);
    if (!record)
      throw Object.assign(problem("Generation not found", 404), {
        code: "OWNERSHIP_VIOLATION",
      });
    if (["generating", "saved"].includes(record.status))
      throw problem("This generation cannot be deleted", 409);
    await remove(
      user,
      [record.sourceStoragePath, record.generatedStoragePath],
      transaction,
    );
    await record.destroy({ transaction });
  });
  return sendStudio(res, req.auth.user, {
    message: "Temporary generation deleted",
  });
});
router.post(
  "/generations/:id/library",
  requireStudioAccount,
  async (req, res) => {
    const user = req.auth.user;
    let copied;
    let created = false;
    let photo;
    try {
      photo = await sequelize.transaction(async (transaction) => {
        await lockStudioOwner(user, transaction);
        const record = await owned(
          Generation,
          req.params.id,
          user,
          transaction,
        );
        if (!record)
          throw Object.assign(problem("Generation not found", 404), {
            code: "OWNERSHIP_VIOLATION",
          });
        const existing = await Photo.findOne({
          where: { generationId: record.id, userId: user.id },
          transaction,
        });
        if (existing) return existing;
        if (record.status !== "generated" || !record.generatedStoragePath)
          throw problem("Generate a photo before saving it", 400);
        copied = await copyGeneratedPhotoToLibrary({
          transaction,
          account: user,
          generatedStoragePath: record.generatedStoragePath,
        });
        const result = await Photo.create(
          { userId: user.id, generationId: record.id, ...copied },
          { transaction },
        );
        await record.update(
          { status: "saved", savedAt: new Date() },
          { transaction },
        );
        created = true;
        return result;
      });
    } catch (error) {
      if (copied) await safelyRemove(user, [copied.storagePath]);
      throw error;
    }
    // Cleanup retains the saved record until storage deletion succeeds.
    return sendStudio(res, req.auth.user, { photo }, created ? 201 : 200);
  },
);
router.get("/library", requireStudioAccount, async (req, res) =>
  sendStudio(res, req.auth.user, {
    photos: await Photo.findAll({
      where: { userId: req.auth.user.id },
      order: [["createdAt", "DESC"]],
    }),
  }),
);
router.delete("/library/:id", requireStudioAccount, async (req, res) => {
  const user = req.auth.user;
  await sequelize.transaction(async (transaction) => {
    await lockStudioOwner(user, transaction);
    const record = await owned(Photo, req.params.id, user, transaction);
    if (!record) throw problem("Library photo not found", 404);
    await remove(user, [record.storagePath], transaction);
    await record.destroy({ transaction });
  });
  return sendStudio(res, req.auth.user, { message: "Library photo deleted" });
});
for (const [kind, Model, field] of [
  ["generations", Generation, "generatedStoragePath"],
  ["library", Photo, "storagePath"],
]) {
  router.get(
    `/${kind}/:id/download`,
    requireStudioAccount,
    async (req, res) => {
      const user = req.auth.user;
      const record = await owned(Model, req.params.id, user);
      if (!record || !record[field])
        throw Object.assign(
          problem("Original does not belong to this account", 404),
          { code: "OWNERSHIP_VIOLATION" },
        );
      res
        .set("Cache-Control", "no-store")
        .json({
          download: await originalDownloadUrl(user, record[field]),
          studio: await studioStatus(user),
        });
    },
  );
}
export default router;
