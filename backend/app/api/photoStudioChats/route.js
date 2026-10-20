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
import crypto from "node:crypto";
import { Router } from "express";
import { Op } from "sequelize";
import { rateLimit } from "express-rate-limit";
import { createPhotoStudioAgentResponse } from "../../../lib/photoStudioAgent.js";
import { getPhotoStudioCreditSummary } from "../../../lib/photoStudioCredits.js";
import {
  requirePhotoStudioAccess,
  requireStudioAccount,
} from "../../../lib/photoStudioAccessGuard.js";
import {
  PhotoStudioChat as Chat,
  PhotoStudioEnvironment as Environment,
  PhotoStudioGenerationAttempt as Attempt,
  PhotoStudioMessage as Message,
  PhotoStudioPhoto as Photo,
  User,
  sequelize,
} from "../../../models/index.js";
import {
  copyGeneratedPhotoToLibrary,
  copyPhotoStudioEnvironmentToChat,
  removePhotoStudioPaths,
  savePhotoStudioChatMessageSource,
  savePhotoStudioChatSource,
} from "../../../lib/photoStudioStorage.js";
const router = Router();
router.use(requirePhotoStudioAccess);
const limit = 5;
const problem = (message, status, code) =>
  Object.assign(new Error(message), { status, code });
const ownedChat = (id, actor, transaction) =>
  Chat.findOne({
    where: { id, ...ownerWhere(actor), status: "active" },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
async function remove(account, storagePaths, transaction) {
  return removePhotoStudioPaths({ account, storagePaths, transaction });
}
async function safelyRemove(account, paths) {
  try {
    await remove(account, paths);
  } catch {
    console.error("Photo Studio chat storage cleanup must be retried");
  }
}
async function messagesFor(chatId, transaction) {
  return Message.findAll({
    where: { chatId },
    order: [["sequence", "ASC"]],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
}
function checkIdle(messages) {
  if (messages.some((message) => message.status === "generating"))
    throw problem(
      "A photograph is already being generated",
      409,
      "PHOTO_STUDIO_GENERATION_IN_PROGRESS",
    );
}
router.get("/", async (req, res) => {
  const chats = await Chat.findAll({
    where: { ...ownerWhere(req.auth.user), status: "active" },
    order: [
      ["lastMessageAt", "DESC"],
      ["createdAt", "DESC"],
    ],
    limit,
  });
  return sendStudio(res, req.auth.user, {
    chats,
    limit,
    remainingSlots: Math.max(0, limit - chats.length),
  });
});
router.get("/:chatId", async (req, res) => {
  const chat = await Chat.findOne({
    where: {
      id: req.params.chatId,
      ...ownerWhere(req.auth.user),
      status: "active",
    },
    include: [
      {
        model: Message,
        as: "messages",
        separate: true,
        order: [["sequence", "ASC"]],
        include: [{ model: Photo, as: "libraryPhoto", required: false }],
      },
    ],
  });
  if (!chat)
    throw Object.assign(problem("Photo Studio chat not found", 404), {
      code: "OWNERSHIP_VIOLATION",
    });
  return sendStudio(res, req.auth.user, { chat });
});
router.post("/", async (req, res) => {
  const user = req.auth.user;
  if (!req.body?.sourcePhotoDataUrl)
    throw problem("sourcePhotoDataUrl is required", 400);
  const paths = [];
  let result;
  try {
    result = await sequelize.transaction(async (transaction) => {
      await lockStudioOwner(user, transaction);
      const count = await Chat.count({
        where: { ...ownerWhere(user), status: "active" },
        transaction,
      });
      if (count >= limit)
        throw problem(
          "Delete an existing Photo Studio chat before creating another",
          409,
          "PHOTO_STUDIO_CHAT_LIMIT_REACHED",
        );
      const environment = await Environment.findOne({
        where: { ...ownerWhere(user) },
        order: [["updatedAt", "DESC"]],
        transaction,
      });

      const id = crypto.randomUUID();
      const source = await savePhotoStudioChatSource({
        transaction,
        account: user,
        chatId: id,
        dataUrl: req.body.sourcePhotoDataUrl,
      });
      paths.push(source.storagePath);
      const reference = environment
        ? await copyPhotoStudioEnvironmentToChat({
            transaction,
            account: user,
            chatId: id,
            environmentStoragePath: environment.storagePath,
          })
        : { imageUrl: null, storagePath: null };
      paths.push(reference.storagePath);
      const chat = await Chat.create(
        {
          id,
          ...ownerWhere(user),
          title:
            String(req.body.title || "")
              .trim()
              .slice(0, 80) || "New photo",
          status: "active",
          sourceImageUrl: source.imageUrl,
          sourceStoragePath: source.storagePath,
          environmentImageUrl: reference.imageUrl,
          environmentStoragePath: reference.storagePath,
          lastMessageAt: new Date(),
        },
        { transaction },
      );
      const sourceMessage = await Message.create(
        {
          chatId: id,
          role: "user",
          type: "source_image",
          imageUrl: source.imageUrl,
          storagePath: source.storagePath,
          status: "completed",
          sequence: 1,
        },
        { transaction },
      );
      return { chat, sourceMessage, remainingSlots: limit - count - 1 };
    });
  } catch (error) {
    await safelyRemove(user, paths);
    throw error;
  }
  return sendStudio(
    res,
    req.auth.user,
    {
      chat: { ...result.chat.toJSON(), messages: [result.sourceMessage] },
      remainingSlots: result.remainingSlots,
    },
    201,
  );
});
router.post("/:chatId/source", async (req, res) => {
  const user = req.auth.user;
  if (!req.body?.sourcePhotoDataUrl)
    throw problem("sourcePhotoDataUrl is required", 400);
  let image;
  let sourceMessage;
  try {
    sourceMessage = await sequelize.transaction(async (transaction) => {
      await lockStudioOwner(user, transaction);
      const chat = await ownedChat(req.params.chatId, user, transaction);
      if (!chat)
        throw Object.assign(problem("Photo Studio chat not found", 404), {
          code: "OWNERSHIP_VIOLATION",
        });
      const messages = await messagesFor(chat.id, transaction);
      checkIdle(messages);
      const id = crypto.randomUUID();
      image = await savePhotoStudioChatMessageSource({
        transaction,
        account: user,
        chatId: chat.id,
        messageId: id,
        dataUrl: req.body.sourcePhotoDataUrl,
      });
      const message = await Message.create(
        {
          id,
          chatId: chat.id,
          role: "user",
          type: "source_image",
          status: "completed",
          imageUrl: image.imageUrl,
          storagePath: image.storagePath,
          sequence: Number(messages.at(-1)?.sequence || 0) + 1,
        },
        { transaction },
      );
      await chat.update(
        {
          sourceImageUrl: image.imageUrl,
          sourceStoragePath: image.storagePath,
          lastMessageAt: new Date(),
        },
        { transaction },
      );
      return message;
    });
  } catch (error) {
    if (image) await safelyRemove(user, [image.storagePath]);
    throw error;
  }
  return sendStudio(res, req.auth.user, { sourceMessage }, 201);
});
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
router.post(
  "/:chatId/messages",
  sharedGuestGenerationLimiter,
  limiter,
  async (req, res) => {
    try {
      const user = req.auth.user;
      const result = await createPhotoStudioAgentResponse({
        user,
        chatId: req.params.chatId,
        instruction: req.body?.instruction,
      });
      return sendStudio(
        res,
        req.auth.user,
        {
          ...result,
          credits: await getPhotoStudioCreditSummary({ ...ownerWhere(user), completing: true }),
        },
        201,
      );
    } catch (error) {
      const status = {
        PHOTO_STUDIO_CHAT_NOT_FOUND: 404,
        PHOTO_STUDIO_GENERATION_IN_PROGRESS: 409,
        PHOTO_STUDIO_INSTRUCTION_REQUIRED: 400,
        PHOTO_STUDIO_INSTRUCTION_TOO_LONG: 400,
        PHOTO_STUDIO_GENERATION_FAILED: 502,
      }[error.code];
      if (status)
        return res
          .status(status)
          .json({ code: error.code, message: error.message });
      throw error;
    }
  },
);
router.post(
  "/:chatId/messages/:messageId/library",
  requireStudioAccount,
  async (req, res) => {
    const user = req.auth.user;
    let copied;
    let created = false;
    let photo;
    try {
      photo = await sequelize.transaction(async (transaction) => {
        await lockStudioOwner(user, transaction);
        const chat = await ownedChat(req.params.chatId, user, transaction);
        if (!chat)
          throw Object.assign(problem("Photo Studio chat not found", 404), {
            code: "OWNERSHIP_VIOLATION",
          });
        const message = await Message.findOne({
          where: {
            id: req.params.messageId,
            chatId: chat.id,
            role: "agent",
            type: "generated_image",
            status: "completed",
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!message?.storagePath)
          throw problem("Generated photograph not found", 404);
        const existing = await Photo.findOne({
          where: { userId: user.id, messageId: message.id },
          transaction,
        });
        if (existing) return existing;
        copied = await copyGeneratedPhotoToLibrary({
          transaction,
          account: user,
          generatedStoragePath: message.storagePath,
        });
        created = true;
        return Photo.create(
          { userId: user.id, messageId: message.id, ...copied },
          { transaction },
        );
      });
    } catch (error) {
      if (copied) await safelyRemove(user, [copied.storagePath]);
      throw error;
    }
    return sendStudio(res, req.auth.user, { photo }, created ? 201 : 200);
  },
);
router.delete("/:chatId", async (req, res) => {
  const user = req.auth.user;
  await sequelize.transaction(async (transaction) => {
    await lockStudioOwner(user, transaction);
    const chat = await ownedChat(req.params.chatId, user, transaction);
    if (!chat)
      throw Object.assign(problem("Photo Studio chat not found", 404), {
        code: "OWNERSHIP_VIOLATION",
      });
    const messages = await messagesFor(chat.id, transaction);
    checkIdle(messages);
    const ids = messages.map((message) => message.id);
    const attempts = ids.length
      ? await Attempt.findAll({
          where: { agentMessageId: { [Op.in]: ids } },
          transaction,
        })
      : [];
    // Delete storage before rows so a failed deletion remains retryable. Library copies use separate paths.
    await remove(
      user,
      [
        chat.sourceStoragePath,
        chat.environmentStoragePath,
        ...messages.map((message) => message.storagePath),
        ...attempts.map((attempt) => attempt.temporaryStoragePath),
      ],
      transaction,
    );
    await chat.destroy({ transaction });
  });
  return sendStudio(res, req.auth.user, {
    message: "Photo Studio chat deleted",
    chatId: req.params.chatId,
  });
});
router.get(
  "/:chatId/messages/:messageId/download",
  requireStudioAccount,
  async (req, res) => {
    const user = req.auth.user;
    const chat = await ownedChat(req.params.chatId, user);
    const message =
      chat &&
      (await Message.findOne({
        where: {
          id: req.params.messageId,
          chatId: chat.id,
          role: "agent",
          status: "completed",
        },
      }));
    if (!message?.storagePath)
      throw Object.assign(
        problem("Original does not belong to this account", 404),
        { code: "OWNERSHIP_VIOLATION" },
      );
    res
      .set("Cache-Control", "no-store")
      .json({
        download: await originalDownloadUrl(user, message.storagePath),
        studio: await studioStatus(user),
      });
  },
);
export default router;
