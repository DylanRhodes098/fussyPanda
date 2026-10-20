import crypto from "node:crypto";
import sharp from "sharp";
import supabase from "./supabase.js";
import { PhotoStudioFile as File, sequelize } from "../models/index.js";
import { ownerWhere, lockStudioOwner, studioError } from "./studioOwner.js";
import { getAccountStoragePrefix } from "./storagePaths.js";
const maxPixels = 40_000_000;
const originalBucket = () => process.env.SUPABASE_PRIVATE_STORAGE_BUCKET;
const previewBucket = () => process.env.SUPABASE_PREVIEW_STORAGE_BUCKET;
let checkedBuckets;
async function checkBuckets() {
  const original = originalBucket(),
    preview = previewBucket();
  if (
    !original ||
    !preview ||
    original === preview ||
    original === process.env.SUPABASE_STORAGE_BUCKET
  )
    throw studioError(
      "STUDIO_NOT_CONFIGURED",
      "Configure distinct private original and preview buckets",
      503,
    );
  if (!checkedBuckets)
    checkedBuckets = (async () => {
      const { data, error } = await supabase.storage.getBucket(original);
      if (error || !data || data.public !== false)
        throw studioError(
          "STUDIO_NOT_CONFIGURED",
          "Original-image bucket must be private",
          503,
        );
    })().catch((error) => {
      checkedBuckets = null;
      throw error;
    });
  await checkedBuckets;
}
const privatePath = (path) =>
  typeof path === "string" && path.startsWith("private/fussy-panda/");
function safePath(path) {
  return (
    typeof path === "string" &&
    !path.split("/").some((part) => part === ".." || part === "." || !part)
  );
}
const previewPath = (path) => `${path}.preview.webp`;
function publicPreview(path) {
  return supabase.storage.from(previewBucket()).getPublicUrl(previewPath(path))
    .data.publicUrl;
}
async function normalize(dataUrl) {
  const match =
    typeof dataUrl === "string" &&
    dataUrl.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/,
    );
  if (!match) throw new Error("Invalid image upload");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024)
    throw new Error("Image must be smaller than 5MB");
  try {
    const image = sharp(buffer, {
      failOn: "error",
      limitInputPixels: maxPixels,
    });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format)) throw new Error();
    return await image
      .rotate()
      .resize({
        width: 3840,
        height: 3840,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 95 })
      .toBuffer();
  } catch {
    throw new Error("Invalid or damaged image");
  }
}
async function watermark(buffer) {
  const info = await sharp(buffer, {
    limitInputPixels: maxPixels,
    failOn: "error",
  }).metadata();
  const maximum = Math.min(
    640,
    Math.max(1, Math.floor(Math.max(info.width, info.height) / 2)),
  );
  const reduced = await sharp(buffer, { limitInputPixels: maxPixels })
    .rotate()
    .resize({
      width: maximum,
      height: maximum,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();
  const { width, height } = await sharp(reduced).metadata();
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="w" width="220" height="80" patternUnits="userSpaceOnUse"><text x="5" y="30" font-size="16" font-family="sans-serif" fill="white" stroke="#333" stroke-width="0.4" opacity="0.65">FUSSY PANDA · PREVIEW</text></pattern></defs><rect width="100%" height="100%" fill="url(#w)"/></svg>`,
  );
  return sharp(reduced)
    .composite([{ input: svg }])
    .webp({ quality: 70 })
    .toBuffer();
}
async function withGuest(actor, transaction, callback) {
  if (!actor.isGuest) return callback(transaction);
  const run = async (tx) => {
    await lockStudioOwner(actor, tx, { completing: true });
    return callback(tx);
  };
  return transaction ? run(transaction) : sequelize.transaction(run);
}
async function upload({
  account,
  storagePath,
  buffer,
  contentType,
  transaction,
}) {
  await checkBuckets();
  return withGuest(account, transaction, async (tx) => {
    const preview = await watermark(buffer);
    const uploaded = [];
    try {
      for (const [bucket, path, bytes, type] of [
        [originalBucket(), storagePath, buffer, contentType],
        [previewBucket(), previewPath(storagePath), preview, "image/webp"],
      ]) {
        const { error } = await supabase.storage
          .from(bucket)
          .upload(path, bytes, {
            contentType: type,
            cacheControl: "60",
            upsert: false,
          });
        if (error) throw new Error("Could not upload Photo Studio image");
        uploaded.push([bucket, path]);
      }
      await File.create(
        {
          ...ownerWhere(account),
          storagePath,
          previewPath: previewPath(storagePath),
        },
        { transaction: tx },
      );
      return { storagePath, imageUrl: publicPreview(storagePath) };
    } catch (error) {
      for (const [bucket, path] of uploaded)
        await supabase.storage
          .from(bucket)
          .remove([path])
          .catch(() => {});
      throw error;
    }
  });
}
const prefix = (actor) =>
  `private/${getAccountStoragePrefix(actor)}/photo-studio`;
async function source(args, suffix) {
  return upload({
    ...args,
    storagePath: `${prefix(args.account)}/${suffix}`,
    buffer: await normalize(args.dataUrl),
    contentType: "image/webp",
  });
}
export const savePhotoStudioEnvironment = (args) =>
  source(args, `environment/${crypto.randomUUID()}.webp`);
export const saveTemporaryPhotoStudioSource = (args) =>
  source(
    args,
    `temporary/${args.generationId}/source-${crypto.randomUUID()}.webp`,
  );
export const savePhotoStudioChatSource = (args) =>
  source(args, `chats/${args.chatId}/source.webp`);
export const savePhotoStudioChatMessageSource = (args) =>
  source(args, `chats/${args.chatId}/sources/${args.messageId}.webp`);
async function generated(args, suffix) {
  const buffer = Buffer.from(args.imageBase64 || "", "base64");
  if (!buffer.length || buffer.length > 25 * 1024 * 1024)
    throw new Error("Generated image is invalid");
  try {
    await sharp(buffer, {
      failOn: "error",
      limitInputPixels: maxPixels,
    }).metadata();
  } catch {
    throw new Error("Generated image is invalid");
  }
  return upload({
    ...args,
    storagePath: `${prefix(args.account)}/${suffix}`,
    buffer,
    contentType: "image/png",
  });
}
export const savePhotoStudioChatAttempt = (args) =>
  generated(
    args,
    `chats/${args.chatId}/responses/${args.agentMessageId}/attempt-${args.attemptNumber}.png`,
  );
export const saveTemporaryGeneratedPhoto = (args) =>
  generated(
    args,
    `temporary/${args.generationId}/generated-${crypto.randomUUID()}.png`,
  );
async function findFile(actor, path, transaction) {
  if (!safePath(path))
    throw studioError(
      "OWNERSHIP_VIOLATION",
      "Image ownership could not be verified",
      404,
    );
  return File.findOne({
    where: { ...ownerWhere(actor), storagePath: path },
    transaction,
  });
}
async function copy(account, path, destination, transaction) {
  await checkBuckets();
  return withGuest(account, transaction, async (tx) => {
    const file = await findFile(account, path, tx);
    const legacy =
      !account.isGuest &&
      !privatePath(path) &&
      safePath(path) &&
      path.startsWith(`${getAccountStoragePrefix(account)}/photo-studio/`);
    if (!file && !legacy)
      throw studioError(
        "OWNERSHIP_VIOLATION",
        "Image does not belong to this session",
        404,
      );
    const { data, error } = await supabase.storage
      .from(legacy ? process.env.SUPABASE_STORAGE_BUCKET : originalBucket())
      .download(path);
    if (error) throw new Error("Could not read Photo Studio image");
    const buffer = Buffer.from(await data.arrayBuffer());
    return upload({
      account,
      storagePath: destination,
      buffer,
      contentType: path.endsWith(".png") ? "image/png" : "image/webp",
      transaction: tx,
    });
  });
}
export const copyPhotoStudioEnvironmentToChat = ({
  account,
  environmentStoragePath,
  chatId,
  transaction,
}) =>
  copy(
    account,
    environmentStoragePath,
    `${prefix(account)}/chats/${chatId}/environment.webp`,
    transaction,
  );
export const copyGeneratedPhotoToLibrary = ({
  account,
  generatedStoragePath,
  transaction,
}) =>
  copy(
    account,
    generatedStoragePath,
    `${prefix(account)}/library/${crypto.randomUUID()}.png`,
    transaction,
  );
export async function referenceImageUrl(path, fallback = null) {
  if (!path) return fallback;
  if (!privatePath(path)) return fallback; // Existing account references are legacy public objects; see migration notes.
  await checkBuckets();
  const { data, error } = await supabase.storage
    .from(originalBucket())
    .createSignedUrl(
      path,
      Math.min(
        900,
        Number(process.env.STUDIO_REFERENCE_URL_TTL_SECONDS) || 600,
      ),
    );
  if (error || !data?.signedUrl)
    throw new Error("Could not authorize provider image reference");
  return data.signedUrl;
}
export async function originalDownloadUrl(actor, path, transaction) {
  if (actor.isGuest)
    throw studioError(
      "AUTHENTICATION_REQUIRED",
      "Log in and claim your work to download originals",
      401,
    );
  if (privatePath(path) && !(await findFile(actor, path, transaction)))
    throw studioError(
      "OWNERSHIP_VIOLATION",
      "Original does not belong to this account",
      404,
    );
  const bucket = privatePath(path)
    ? originalBucket()
    : process.env.SUPABASE_STORAGE_BUCKET;
  if (!bucket || !safePath(path))
    throw studioError("ORIGINAL_UNAVAILABLE", "Original is unavailable", 404);
  if (privatePath(path)) await checkBuckets();
  const ttl = Math.max(
    1,
    Math.min(120, Number(process.env.STUDIO_DOWNLOAD_URL_TTL_SECONDS) || 60),
  );
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttl, { download: true });
  if (error || !data?.signedUrl)
    throw studioError("ORIGINAL_UNAVAILABLE", "Original is unavailable", 404);
  return { url: data.signedUrl, expiresIn: ttl };
}
export async function removePhotoStudioPaths({
  account,
  storagePaths,
  transaction,
}) {
  // Claims only change database ownership; guest namespace paths remain valid through tracked ownership.
  for (const path of [...new Set(storagePaths)].filter(Boolean)) {
    const file = await findFile(account, path, transaction);
    if (file) {
      for (const [bucket, target] of [
        [originalBucket(), path],
        [previewBucket(), file.previewPath],
      ]) {
        const { error } = await supabase.storage.from(bucket).remove([target]);
        if (error) throw new Error("Could not delete Photo Studio files");
      }
      await file.destroy({ transaction });
    } else if (
      privatePath(path) &&
      safePath(path) &&
      path.startsWith(`${prefix(account)}/`) &&
      !(await File.findOne({ where: { storagePath: path }, transaction }))
    ) {
      // A database rollback can remove tracking rows after upload; clean only the caller's own untracked namespace.
      for (const [bucket, target] of [
        [originalBucket(), path],
        [previewBucket(), previewPath(path)],
      ]) {
        const { error } = await supabase.storage.from(bucket).remove([target]);
        if (error) throw new Error("Could not delete Photo Studio files");
      }
    } else if (
      !account.isGuest &&
      !privatePath(path) &&
      safePath(path) &&
      path.startsWith(`${getAccountStoragePrefix(account)}/photo-studio/`)
    ) {
      const { error } = await supabase.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET)
        .remove([path]);
      if (error) throw new Error("Could not delete legacy Photo Studio files");
    }
  }
}
