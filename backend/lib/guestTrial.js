import crypto from "node:crypto";
import { Op } from "sequelize";
import {
  GuestSession,
  PhotoStudioEnvironment as Environment,
  PhotoStudioChat as Chat,
  PhotoStudioGeneration as Generation,
  PhotoStudioCreditBucket as Bucket,
  PhotoStudioCreditLedgerEntry as Ledger,
  PhotoStudioFile as File,
  User,
  sequelize,
} from "../models/index.js";
import { cookieOptions } from "./auth.js";
import { studioError, ownerWhere } from "./studioOwner.js";
export const GUEST_COOKIE = "fp_guest";
export const TRIAL_ALLOWANCE = 5;
export const guestLifetimeMs = () =>
  Math.max(
    60_000,
    Math.min(30 * 86400000, Number(process.env.GUEST_TTL_MS) || 7 * 86400000),
  );
export function guestCookie(req) {
  const values = (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${GUEST_COOKIE}=`));
  if (!values.length) return null;
  if (
    values.length !== 1 ||
    !/^[a-f0-9]{64}$/.test(values[0].slice(GUEST_COOKIE.length + 1))
  )
    throw studioError("GUEST_SESSION_INVALID", "Guest session is invalid", 410);
  return values[0].slice(GUEST_COOKIE.length + 1);
}
export async function guestFromRequest(
  req,
  { transaction, lock = false, allowClaimed = false } = {},
) {
  const secret = guestCookie(req);
  if (!secret) return null;
  const guest = await GuestSession.findOne({
    where: {
      secretHash: crypto.createHash("sha256").update(secret).digest("hex"),
    },
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!guest)
    throw studioError("GUEST_SESSION_INVALID", "Guest session is invalid", 410);
  if (guest.status === "claimed" && allowClaimed) return guest;
  if (guest.status === "claimed")
    throw studioError(
      "GUEST_SESSION_CLAIMED",
      "This trial has already been claimed; log in to access it",
      410,
    );
  if (guest.status !== "active" || guest.expiresAt <= new Date())
    throw studioError(
      "GUEST_SESSION_EXPIRED",
      "Guest session has expired",
      410,
    );
  return guest;
}
export async function createGuest(req, res) {
  const existing = await guestFromRequest(req);
  if (existing) return { id: existing.id, isGuest: true };
  const secret = crypto.randomBytes(32).toString("hex");
  const guest = await sequelize.transaction(async (transaction) => {
    const ipHash = crypto
      .createHmac("sha256", process.env.JWT_SECRET)
      .update(req.ip || "unknown")
      .digest("hex");
    const max = Number(process.env.GUEST_CREATION_IP_LIMIT) || 10;
    const windowMs = Number(process.env.GUEST_CREATION_WINDOW_MS) || 86400000;
    const count = await GuestSession.count({
      where: {
        ipHash,
        createdAt: { [Op.gt]: new Date(Date.now() - windowMs) },
      },
      transaction,
    });
    if (count >= max)
      throw studioError(
        "GUEST_CREATION_RATE_LIMITED",
        "Too many trials from this network; please try later",
        429,
      );
    const guest = await GuestSession.create(
      {
        secretHash: crypto.createHash("sha256").update(secret).digest("hex"),
        expiresAt: new Date(Date.now() + guestLifetimeMs()),
        ipHash,
      },
      { transaction },
    );
    const grantKey = `guest:${guest.id}`;
    const bucket = await Bucket.create(
      {
        userId: null,
        guestId: guest.id,
        kind: "guest_trial",
        sourceId: guest.id,
        grantKey,
        allowance: TRIAL_ALLOWANCE,
        remaining: TRIAL_ALLOWANCE,
        reserved: 0,
        status: "active",
      },
      { transaction },
    );
    await Ledger.create(
      {
        userId: null,
        guestId: guest.id,
        bucketId: bucket.id,
        operationId: crypto.randomUUID(),
        type: "grant",
        amount: TRIAL_ALLOWANCE,
        idempotencyKey: `${grantKey}:grant`,
      },
      { transaction },
    );
    return guest;
  });
  // Keep the spent/claimed credential longer than the active trial: expiry must not silently grant another trial.
  res.cookie(GUEST_COOKIE, secret, {
    ...cookieOptions(),
    maxAge: 90 * 86400000,
  });
  return { id: guest.id, isGuest: true };
}
export async function claimGuest(req, user, { transaction } = {}) {
  const run = async (tx) => {
    let guest;
    try {
      guest = await guestFromRequest(req, {
        transaction: tx,
        lock: true,
        allowClaimed: true,
      });
    } catch (error) {
      if (error.status === 410)
        return { status: "unavailable", code: error.code };
      throw error;
    }
    if (!guest) return { status: "none" };
    if (guest.status === "claimed")
      return guest.claimedByUserId === user.id
        ? { status: "already_claimed" }
        : { status: "conflict", code: "GUEST_ALREADY_CLAIMED" };
    const where = { guestId: guest.id };
    const reserved = await Bucket.sum("reserved", { where, transaction: tx });
    if (
      reserved > 0 ||
      (await Generation.count({
        where: { ...where, status: "generating" },
        transaction: tx,
      }))
    ) {
      return { status: "pending", code: "GUEST_GENERATION_IN_PROGRESS" };
    }
    await User.findByPk(user.id, { transaction: tx, lock: tx.LOCK.UPDATE });
    // Existing and guest environments are both retained; latest becomes the account's current environment.
    for (const Model of [Environment, Chat, Generation, File, Ledger])
      await Model.update(
        { userId: user.id, guestId: null },
        { where, transaction: tx },
      );
    await Bucket.update(
      { userId: user.id, guestId: null, kind: "claimed_trial" },
      { where, transaction: tx },
    );
    await guest.update(
      { status: "claimed", claimedByUserId: user.id, claimedAt: new Date() },
      { transaction: tx },
    );
    return { status: "claimed" };
  };
  return transaction ? run(transaction) : sequelize.transaction(run);
}
export function guestHeartbeat(actor) {
  if (!actor.isGuest) return () => {};
  const timer = setInterval(
    () =>
      GuestSession.update(
        { lastWorkAt: new Date() },
        { where: { id: actor.id, status: "active" } },
      ).catch(() => {}),
    30_000,
  );
  timer.unref();
  return () => clearInterval(timer);
}
