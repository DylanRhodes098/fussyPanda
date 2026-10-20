import sequelize from "../lib/db.js";
import GuestSession from "./guestSession.js";
import PhotoStudioFile from "./photoStudioFile.js";
import User from "./user.js";
import PasswordResetToken from "./passwordResetToken.js";

import PhotoStudioEnvironment from "./photoStudioEnvironment.js";
import PhotoStudioGeneration from "./photoStudioGeneration.js";
import PhotoStudioChat from "./photoStudioChat.js";
import PhotoStudioMessage from "./photoStudioMessage.js";
import PhotoStudioGenerationAttempt from "./photoStudioGenerationAttempt.js";
import PhotoStudioPhoto from "./photoStudioPhoto.js";
import PhotoStudioSubscription from "./photoStudioSubscription.js";
import PhotoStudioCreditBucket from "./photoStudioCreditBucket.js";
import PhotoStudioCreditLedgerEntry from "./photoStudioCreditLedgerEntry.js";
import StripeWebhookEvent from "./stripeWebhookEvent.js";

User.hasMany(PhotoStudioChat, {
  foreignKey: "userId",
  as: "photoStudioChats",
});

PhotoStudioChat.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

PhotoStudioChat.hasMany(PhotoStudioMessage, {
  foreignKey: "chatId",
  as: "messages",
});

PhotoStudioMessage.belongsTo(PhotoStudioChat, {
  foreignKey: "chatId",
  as: "chat",
});

PhotoStudioMessage.belongsTo(PhotoStudioMessage, {
  foreignKey: "parentAgentMessageId",
  as: "parentAgentMessage",
});

PhotoStudioMessage.hasMany(PhotoStudioMessage, {
  foreignKey: "parentAgentMessageId",
  as: "derivedMessages",
});

PhotoStudioMessage.hasMany(PhotoStudioGenerationAttempt, {
  foreignKey: "agentMessageId",
  as: "attempts",
});

PhotoStudioGenerationAttempt.belongsTo(PhotoStudioMessage, {
  foreignKey: "agentMessageId",
  as: "agentMessage",
});

User.hasOne(PhotoStudioSubscription, {
  foreignKey: "userId",
  as: "photoStudioSubscription",
});

PhotoStudioSubscription.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(PhotoStudioCreditBucket, {
  foreignKey: "userId",
  as: "photoStudioCreditBuckets",
});

PhotoStudioCreditBucket.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(PhotoStudioCreditLedgerEntry, {
  foreignKey: "userId",
  as: "photoStudioCreditLedgerEntries",
});

PhotoStudioCreditLedgerEntry.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

PhotoStudioCreditBucket.hasMany(PhotoStudioCreditLedgerEntry, {
  foreignKey: "bucketId",
  as: "ledgerEntries",
});

PhotoStudioCreditLedgerEntry.belongsTo(PhotoStudioCreditBucket, {
  foreignKey: "bucketId",
  as: "bucket",
});

PhotoStudioChat.hasMany(PhotoStudioCreditLedgerEntry, {
  foreignKey: "chatId",
  as: "creditLedgerEntries",
});

PhotoStudioCreditLedgerEntry.belongsTo(PhotoStudioChat, {
  foreignKey: "chatId",
  as: "chat",
});

PhotoStudioMessage.hasMany(PhotoStudioCreditLedgerEntry, {
  foreignKey: "agentMessageId",
  as: "creditLedgerEntries",
});

PhotoStudioCreditLedgerEntry.belongsTo(PhotoStudioMessage, {
  foreignKey: "agentMessageId",
  as: "agentMessage",
});

PhotoStudioMessage.hasOne(PhotoStudioPhoto, {
  foreignKey: "messageId",
  as: "libraryPhoto",
});

PhotoStudioPhoto.belongsTo(PhotoStudioMessage, {
  foreignKey: "messageId",
  as: "message",
});

User.hasOne(PhotoStudioEnvironment, {
  foreignKey: "userId",
  as: "photoStudioEnvironment",
});

PhotoStudioEnvironment.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(PhotoStudioGeneration, {
  foreignKey: "userId",
  as: "photoStudioGenerations",
});

PhotoStudioGeneration.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

PhotoStudioEnvironment.hasMany(PhotoStudioGeneration, {
  foreignKey: "environmentId",
  as: "generations",
});

PhotoStudioGeneration.belongsTo(PhotoStudioEnvironment, {
  foreignKey: "environmentId",
  as: "environment",
});

User.hasMany(PhotoStudioPhoto, {
  foreignKey: "userId",
  as: "photoStudioPhotos",
});

PhotoStudioPhoto.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

PhotoStudioGeneration.hasOne(PhotoStudioPhoto, {
  foreignKey: "generationId",
  as: "libraryPhoto",
});

PhotoStudioPhoto.belongsTo(PhotoStudioGeneration, {
  foreignKey: "generationId",
  as: "generation",
});

User.hasMany(PasswordResetToken, {
  foreignKey: "userId",
  as: "passwordResetTokens",
});
PasswordResetToken.belongsTo(User, { foreignKey: "userId", as: "user" });
export {
  GuestSession,
  PhotoStudioFile,
  sequelize,
  User,
  PasswordResetToken,
  PhotoStudioEnvironment,
  PhotoStudioGeneration,
  PhotoStudioChat,
  PhotoStudioMessage,
  PhotoStudioGenerationAttempt,
  PhotoStudioPhoto,
  PhotoStudioSubscription,
  PhotoStudioCreditBucket,
  PhotoStudioCreditLedgerEntry,
  StripeWebhookEvent,
};
export default {
  GuestSession,
  PhotoStudioFile,
  User,
  PasswordResetToken,
  PhotoStudioEnvironment,
  PhotoStudioGeneration,
  PhotoStudioChat,
  PhotoStudioMessage,
  PhotoStudioGenerationAttempt,
  PhotoStudioPhoto,
  PhotoStudioSubscription,
  PhotoStudioCreditBucket,
  PhotoStudioCreditLedgerEntry,
  StripeWebhookEvent,
};
