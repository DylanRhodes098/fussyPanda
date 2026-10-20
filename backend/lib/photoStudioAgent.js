import { ownerWhere, creditOwner, lockStudioOwner } from "./studioOwner.js";
import { guestHeartbeat } from "./guestTrial.js";
import { referenceImageUrl } from "./photoStudioStorage.js";
import {
  User,
  PhotoStudioChat,
  PhotoStudioGenerationAttempt,
  PhotoStudioMessage,
  sequelize,
} from "../models/index.js";

import { PHOTO_STUDIO_CHAT_STATUSES } from "../models/photoStudioChat.js";

import {
  PHOTO_STUDIO_MESSAGE_ROLES,
  PHOTO_STUDIO_MESSAGE_STATUSES,
  PHOTO_STUDIO_MESSAGE_TYPES,
} from "../models/photoStudioMessage.js";

import { PHOTO_STUDIO_ATTEMPT_STATUSES } from "../models/photoStudioGenerationAttempt.js";

import {
  consumePhotoStudioCredit,
  releasePhotoStudioCredit,
  reservePhotoStudioCredit,
} from "./photoStudioCredits.js";

import {
  generatePhotoStudioAgentImage,
  PHOTO_STUDIO_AGENT_IMAGE_MODEL,
} from "./photoStudioAgentGeneration.js";

import { evaluateGeneratedFoodImage } from "./photoGenerationQa.js";

import {
  removePhotoStudioPaths,
  savePhotoStudioChatAttempt,
} from "./photoStudioStorage.js";

const configuredMaximumAttempts = Number(
  process.env.PHOTO_GENERATION_MAX_RETRIES,
);

const MAXIMUM_ATTEMPTS =
  Number.isInteger(configuredMaximumAttempts) && configuredMaximumAttempts >= 0
    ? configuredMaximumAttempts + 1
    : 2;

function normalizeInstruction(value) {
  return String(value || "").trim();
}
function agentError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function prepareAgentResponse({ user, chatId, instruction }) {
  if (instruction != null && typeof instruction !== "string")
    throw agentError(
      "Instruction must be text",
      "PHOTO_STUDIO_INSTRUCTION_REQUIRED",
    );
  return sequelize.transaction(async (transaction) => {
    await lockStudioOwner(user, transaction);
    const chat = await PhotoStudioChat.findOne({
      where: {
        id: chatId,
        ...ownerWhere(user),
        status: PHOTO_STUDIO_CHAT_STATUSES.ACTIVE,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!chat) {
      throw agentError(
        "Photo Studio chat not found",
        "PHOTO_STUDIO_CHAT_NOT_FOUND",
      );
    }

    const messages = await PhotoStudioMessage.findAll({
      where: {
        chatId: chat.id,
      },
      order: [["sequence", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const generationInProgress = messages.some(
      (message) =>
        message.role === PHOTO_STUDIO_MESSAGE_ROLES.AGENT &&
        message.status === PHOTO_STUDIO_MESSAGE_STATUSES.GENERATING,
    );
    if (generationInProgress) {
      throw agentError(
        "A photograph is already being generated",
        "PHOTO_STUDIO_GENERATION_IN_PROGRESS",
      );
    }

    const completedAgentMessages = messages.filter(
      (message) =>
        message.role === PHOTO_STUDIO_MESSAGE_ROLES.AGENT &&
        message.type === PHOTO_STUDIO_MESSAGE_TYPES.GENERATED_IMAGE &&
        message.status === PHOTO_STUDIO_MESSAGE_STATUSES.COMPLETED &&
        message.imageUrl,
    );

    const previousAgentMessage = completedAgentMessages.at(-1) || null;

    const completedSourceMessages = messages.filter(
      (message) =>
        message.role === PHOTO_STUDIO_MESSAGE_ROLES.USER &&
        message.type === PHOTO_STUDIO_MESSAGE_TYPES.SOURCE_IMAGE &&
        message.status === PHOTO_STUDIO_MESSAGE_STATUSES.COMPLETED &&
        message.imageUrl,
    );

    const latestSourceMessage = completedSourceMessages.at(-1) || null;

    const sourceChangedSinceLastResponse = Boolean(
      previousAgentMessage &&
      latestSourceMessage &&
      latestSourceMessage.sequence > previousAgentMessage.sequence,
    );

    const previousImageForGeneration = sourceChangedSinceLastResponse
      ? null
      : previousAgentMessage;

    const normalizedInstruction = normalizeInstruction(instruction);

    if (
      previousAgentMessage &&
      !sourceChangedSinceLastResponse &&
      !normalizedInstruction
    ) {
      throw agentError(
        "An instruction is required after the first agent response",
        "PHOTO_STUDIO_INSTRUCTION_REQUIRED",
      );
    }

    if (normalizedInstruction.length > 500) {
      throw agentError(
        "Instructions must be 500 characters or fewer",
        "PHOTO_STUDIO_INSTRUCTION_TOO_LONG",
      );
    }

    let nextSequence =
      messages.length > 0 ? Number(messages.at(-1).sequence) + 1 : 1;

    let userMessage = null;

    if (previousAgentMessage && normalizedInstruction) {
      userMessage = await PhotoStudioMessage.create(
        {
          chatId: chat.id,
          role: PHOTO_STUDIO_MESSAGE_ROLES.USER,
          type: PHOTO_STUDIO_MESSAGE_TYPES.INSTRUCTION,
          text: normalizedInstruction,
          imageUrl: null,
          storagePath: null,
          status: PHOTO_STUDIO_MESSAGE_STATUSES.COMPLETED,
          sequence: nextSequence,
          parentAgentMessageId: previousAgentMessage.id,
        },
        { transaction },
      );

      nextSequence += 1;
    }

    const agentMessage = await PhotoStudioMessage.create(
      {
        chatId: chat.id,
        role: PHOTO_STUDIO_MESSAGE_ROLES.AGENT,
        type: PHOTO_STUDIO_MESSAGE_TYPES.GENERATED_IMAGE,
        text: null,
        imageUrl: null,
        storagePath: null,
        status: PHOTO_STUDIO_MESSAGE_STATUSES.GENERATING,
        sequence: nextSequence,
        parentAgentMessageId: previousImageForGeneration?.id || null,
        model: PHOTO_STUDIO_AGENT_IMAGE_MODEL,
      },
      { transaction },
    );
    const reservation = await reservePhotoStudioCredit({
      ...ownerWhere(user),
      chatId: chat.id,
      agentMessageId: agentMessage.id,
      transaction,
    });

    await agentMessage.update(
      {
        creditOperationId: reservation.operationId,
      },
      { transaction },
    );

    await chat.update(
      {
        lastMessageAt: new Date(),
      },
      { transaction },
    );
    return {
      chat,
      userMessage,
      agentMessage,
      previousAgentMessage: previousImageForGeneration,
      sourceImageUrl: latestSourceMessage?.imageUrl || chat.sourceImageUrl,
      sourceStoragePath:
        latestSourceMessage?.storagePath || chat.sourceStoragePath,
      instruction: normalizedInstruction || null,
      creditOperationId: reservation.operationId,
    };
  });
}

async function safelyRemoveAttempt({ user, storagePath }) {
  if (!storagePath) return;

  try {
    await removePhotoStudioPaths({
      account: user,
      storagePaths: [storagePath],
    });
  } catch (error) {
    console.error("Could not remove rejected Photo Studio attempt:", error);
  }
}

async function failAgentResponse({
  user,
  agentMessage,
  creditOperationId,
  error,
}) {
  await sequelize.transaction(async (transaction) => {
    await lockStudioOwner(user, transaction, { completing: true });
    const message = await PhotoStudioMessage.findByPk(agentMessage.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (message?.status === PHOTO_STUDIO_MESSAGE_STATUSES.GENERATING) {
      await releasePhotoStudioCredit({
        ...creditOwner(user),
        operationId: creditOperationId,
        transaction,
      });
      await message.update(
        {
          status: PHOTO_STUDIO_MESSAGE_STATUSES.FAILED,
          imageUrl: null,
          storagePath: null,
          generatedAt: null,
        },
        { transaction },
      );
    }
  });

  const responseError = agentError(
    "Could not generate the polished photograph",
    "PHOTO_STUDIO_GENERATION_FAILED",
  );

  if (error?.code === "STUDIO_NOT_CONFIGURED") throw error;
  responseError.cause = error;

  throw responseError;
}

async function createPhotoStudioAgentResponseImpl({
  user,
  chatId,
  instruction,
}) {
  const prepared = await prepareAgentResponse({
    user,
    chatId,
    instruction,
  });

  let retryPrompt = null;
  let lastError = null;

  for (
    let attemptNumber = 1;
    attemptNumber <= MAXIMUM_ATTEMPTS;
    attemptNumber += 1
  ) {
    const attempt = await PhotoStudioGenerationAttempt.create({
      agentMessageId: prepared.agentMessage.id,
      attemptNumber,
      status: PHOTO_STUDIO_ATTEMPT_STATUSES.GENERATING,
      provider: "openai",
      model: PHOTO_STUDIO_AGENT_IMAGE_MODEL,
      startedAt: new Date(),
    });
    let storedImage = null;

    try {
      const generated = await generatePhotoStudioAgentImage({
        environmentImageUrl:
          (await referenceImageUrl(
            prepared.chat.environmentStoragePath,
            prepared.chat.environmentImageUrl,
          )) ||
          (await referenceImageUrl(
            prepared.sourceStoragePath,
            prepared.sourceImageUrl,
          )),
        sourceImageUrl: await referenceImageUrl(
          prepared.sourceStoragePath,
          prepared.sourceImageUrl,
        ),
        previousImageUrl: await referenceImageUrl(
          prepared.previousAgentMessage?.storagePath,
          prepared.previousAgentMessage?.imageUrl,
        ),
        instruction: prepared.instruction,
        retryPrompt,
        userId: user.id,
      });

      storedImage = await savePhotoStudioChatAttempt({
        imageBase64: generated.imageBase64,
        account: user,
        chatId: prepared.chat.id,
        agentMessageId: prepared.agentMessage.id,
        attemptNumber,
      });

      const qa = await evaluateGeneratedFoodImage({
        knowledgeImageUrl:
          (await referenceImageUrl(
            prepared.chat.environmentStoragePath,
            prepared.chat.environmentImageUrl,
          )) ||
          (await referenceImageUrl(
            prepared.sourceStoragePath,
            prepared.sourceImageUrl,
          )),
        sourceImageUrl: await referenceImageUrl(
          prepared.sourceStoragePath,
          prepared.sourceImageUrl,
        ),
        generatedImageUrl: await referenceImageUrl(
          storedImage.storagePath,
          storedImage.imageUrl,
        ),
      });

      const qaScore = Math.max(0, Math.min(100, Number(qa?.score) || 0));

      const passed = qa?.passed === true;

      await attempt.update({
        status: passed
          ? PHOTO_STUDIO_ATTEMPT_STATUSES.PASSED
          : PHOTO_STUDIO_ATTEMPT_STATUSES.REJECTED,
        temporaryImageUrl: storedImage.imageUrl,
        temporaryStoragePath: storedImage.storagePath,
        qaScore,
        qaIssues: Array.isArray(qa?.issues) ? qa.issues : [],
        completedAt: new Date(),
      });

      if (!passed) {
        retryPrompt = String(
          qa?.retryPrompt ||
            "Improve the natural integration, lighting, perspective and food preservation.",
        )
          .trim()
          .slice(0, 1000);

        await safelyRemoveAttempt({
          user,
          storagePath: storedImage.storagePath,
        });

        continue;
      }

      await sequelize.transaction(async (transaction) => {
        await lockStudioOwner(user, transaction, { completing: true });
        const lockedMessage = await PhotoStudioMessage.findByPk(
          prepared.agentMessage.id,
          {
            transaction,
            lock: transaction.LOCK.UPDATE,
          },
        );

        if (
          !lockedMessage ||
          lockedMessage.status !== PHOTO_STUDIO_MESSAGE_STATUSES.GENERATING
        ) {
          throw new Error("Agent message is no longer generating");
        }
        await lockedMessage.update(
          {
            imageUrl: storedImage.imageUrl,
            storagePath: storedImage.storagePath,
            status: PHOTO_STUDIO_MESSAGE_STATUSES.COMPLETED,
            model: generated.model,
            generatedAt: new Date(),
          },
          { transaction },
        );

        await consumePhotoStudioCredit({
          ...creditOwner(user),
          operationId: prepared.creditOperationId,
          transaction,
        });

        await prepared.chat.update(
          {
            lastMessageAt: new Date(),
          },
          { transaction },
        );
      });

      const completedMessage = await PhotoStudioMessage.findByPk(
        prepared.agentMessage.id,
      );

      return {
        userMessage: prepared.userMessage,
        agentMessage: completedMessage,
      };
    } catch (error) {
      lastError = error;

      await attempt.update({
        status: PHOTO_STUDIO_ATTEMPT_STATUSES.FAILED,
        errorMessage: String(
          error?.message || "Unknown generation error",
        ).slice(0, 2000),
        completedAt: new Date(),
      });
      await safelyRemoveAttempt({
        user,
        storagePath: storedImage?.storagePath,
      });
    }
  }

  return failAgentResponse({
    user,
    agentMessage: prepared.agentMessage,
    creditOperationId: prepared.creditOperationId,
    error: lastError,
  });
}

export async function createPhotoStudioAgentResponse(args) {
  const stop = guestHeartbeat(args.user);
  try {
    return await createPhotoStudioAgentResponseImpl(args);
  } finally {
    stop();
  }
}
