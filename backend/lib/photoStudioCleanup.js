import { actorFor, lockStudioOwner } from "./studioOwner.js";
import { cleanupGuestTrials } from "./guestCleanup.js";
import { Op } from "sequelize";
import {
  PhotoStudioChat as Chat,
  PhotoStudioGeneration as Generation,
  PhotoStudioGenerationAttempt as Attempt,
  PhotoStudioMessage as Message,
  PhotoStudioCreditBucket as Bucket,
  User,
  sequelize,
} from "../models/index.js";
import {
  releasePhotoStudioCredit,
  expirePhotoStudioCreditBuckets,
} from "./photoStudioCredits.js";
import { removePhotoStudioPaths } from "./photoStudioStorage.js";
const positive = (value, fallback) =>
  Number.isFinite(Number(value)) && Number(value) > 0
    ? Number(value)
    : fallback;
export async function cleanupAbandonedPhotoStudioGenerations() {
  const cutoff = new Date(
    Date.now() -
      positive(process.env.PHOTO_STUDIO_TEMP_MAX_AGE_MS, 60 * 60 * 1000),
  );
  const candidates = await Generation.findAll({
    where: {
      guestId: null,
      [Op.or]: [
        {
          status: { [Op.in]: ["generating", "generated", "failed"] },
          updatedAt: { [Op.lt]: cutoff },
        },
        {
          status: "saved",
          [Op.or]: [
            { sourceStoragePath: { [Op.ne]: null } },
            { generatedStoragePath: { [Op.ne]: null } },
          ],
        },
      ],
    },
  });
  let cleaned = 0;
  for (const candidate of candidates) {
    try {
      const result = await sequelize.transaction(async (transaction) => {
        await User.findByPk(candidate.userId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const record = await Generation.findByPk(candidate.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (
          !record ||
          (record.status !== "saved" && record.updatedAt >= cutoff)
        )
          return false;
        const account = await User.findByPk(record.userId, { transaction });
        if (record.status === "generating" && record.creditOperationId) {
          await releasePhotoStudioCredit({
            userId: record.userId,
            operationId: record.creditOperationId,
            transaction,
          });
          await record.update(
            {
              status: "failed",
              errorMessage: "Abandoned generation recovered",
            },
            { transaction },
          );
        }
        await removePhotoStudioPaths({
          account,
          storagePaths: [record.sourceStoragePath, record.generatedStoragePath],
          transaction,
        });
        if (record.status === "saved")
          await record.update(
            {
              sourceImageUrl: null,
              sourceStoragePath: null,
              generatedImageUrl: null,
              generatedStoragePath: null,
            },
            { transaction },
          );
        else await record.destroy({ transaction });
        return true;
      });
      if (result) cleaned++;
    } catch {
      console.error("Photo Studio generation cleanup must be retried");
    }
  }
  return cleaned;
}
export async function cleanupAbandonedPhotoStudioChatGenerations() {
  const cutoff = new Date(
    Date.now() -
      positive(
        process.env.PHOTO_STUDIO_CHAT_GENERATION_MAX_AGE_MS,
        20 * 60 * 1000,
      ),
  );
  const candidates = await Message.findAll({
    where: {
      role: "agent",
      type: "generated_image",
      status: "generating",
      updatedAt: { [Op.lt]: cutoff },
    },
  });
  let cleaned = 0;
  for (const candidate of candidates) {
    try {
      const owner = await Chat.findByPk(candidate.chatId);
      if (!owner || owner.guestId) continue;
      const result = await sequelize.transaction(async (transaction) => {
        await User.findByPk(owner.userId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        // Match the agent's lock order: chat, message, credit account.
        const chat = await Chat.findByPk(candidate.chatId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const message = await Message.findByPk(candidate.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (
          !chat ||
          !message ||
          message.status !== "generating" ||
          message.updatedAt >= cutoff
        )
          return false;
        if (message.creditOperationId)
          await releasePhotoStudioCredit({
            userId: chat.userId,
            operationId: message.creditOperationId,
            transaction,
          });
        await message.update(
          {
            status: "failed",
            imageUrl: null,
            storagePath: null,
            generatedAt: null,
          },
          { transaction },
        );
        return true;
      });
      if (result) cleaned++;
    } catch {
      console.error("Photo Studio chat recovery must be retried");
    }
  }
  // Rejected/failed attempts retain their paths until deletion succeeds.
  const attempts = await Attempt.findAll({
    where: {
      status: { [Op.in]: ["failed", "rejected", "generating"] },
      updatedAt: { [Op.lt]: cutoff },
      temporaryStoragePath: { [Op.ne]: null },
    },
  });
  for (const attempt of attempts) {
    try {
      const message = await Message.findByPk(attempt.agentMessageId);
      if (message?.status === "generating") continue;
      const chat = message && (await Chat.findByPk(message.chatId));
      if (chat?.guestId) continue;
      const account = chat && (await User.findByPk(chat.userId));
      if (!account) continue;
      await removePhotoStudioPaths({
        account,
        storagePaths: [attempt.temporaryStoragePath],
      });
      await attempt.update({
        temporaryStoragePath: null,
        temporaryImageUrl: null,
      });
    } catch {
      console.error("Photo Studio attempt cleanup must be retried");
    }
  }
  return cleaned;
}
export async function runPhotoStudioCleanup() {
  const result = {
    guests: await cleanupGuestTrials(),
    generations: await cleanupAbandonedPhotoStudioGenerations(),
    chats: await cleanupAbandonedPhotoStudioChatGenerations(),
  };
  const users = await Bucket.findAll({
    attributes: ["userId"],
    group: ["userId"],
    where: {
      guestId: null,
      status: "active",
      expiresAt: { [Op.lte]: new Date() },
    },
  });
  for (const { userId } of users)
    await expirePhotoStudioCreditBuckets({ userId });
  return result;
}
export function startPhotoStudioCleanup() {
  let running = false;
  const timer = setInterval(
    async () => {
      if (running) return;
      running = true;
      try {
        await runPhotoStudioCleanup();
      } catch {
        console.error("Photo Studio cleanup will retry");
      } finally {
        running = false;
      }
    },
    positive(process.env.PHOTO_STUDIO_CLEANUP_INTERVAL_MS, 5 * 60 * 1000),
  );
  timer.unref();
  return () => clearInterval(timer);
}
