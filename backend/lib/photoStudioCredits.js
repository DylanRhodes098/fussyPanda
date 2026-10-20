import {
  ownerWhere,
  actorFor,
  lockStudioOwner,
  studioError,
} from "./studioOwner.js";
import crypto from "node:crypto";
import { Op } from "sequelize";
import {
  GuestSession,
  User,
  PhotoStudioSubscription,
  PhotoStudioCreditBucket as Bucket,
  PhotoStudioCreditLedgerEntry as Ledger,
  sequelize,
} from "../models/index.js";
import { subscriptionIsUsable } from "./photoStudioEntitlements.js";
import { getPhotoStudioPlanAllowance } from "./photoStudioPlans.js";
export const SIGNUP_ALLOWANCE = 25;
async function locked(
  userId,
  transaction,
  callback,
  guestId = null,
  completing = false,
) {
  const run = async (current) => {
    await lockStudioOwner(
      guestId ? { id: guestId, isGuest: true } : { id: userId },
      current,
      { completing },
    );
    return callback(current);
  };
  return transaction ? run(transaction) : sequelize.transaction(run);
}
async function grantEntry(bucket, amount, key, transaction) {
  await Ledger.create(
    {
      operationId: crypto.randomUUID(),
      userId: bucket.userId,
      bucketId: bucket.id,
      type: "grant",
      amount,
      idempotencyKey: key,
      metadata: { kind: bucket.kind, sourceId: bucket.sourceId },
    },
    { transaction },
  );
}
export async function ensurePhotoStudioSignupCredits({ userId, transaction }) {
  return locked(userId, transaction, async (tx) => {
    const grantKey = `signup:${userId}`;
    let bucket = await Bucket.findOne({ where: { grantKey }, transaction: tx });
    if (!bucket) {
      bucket = await Bucket.create(
        {
          userId,
          kind: "signup",
          sourceId: userId,
          grantKey,
          allowance: SIGNUP_ALLOWANCE,
          remaining: SIGNUP_ALLOWANCE,
          reserved: 0,
          status: "active",
        },
        { transaction: tx },
      );
      await grantEntry(bucket, SIGNUP_ALLOWANCE, `${grantKey}:grant`, tx);
    }
    return bucket;
  });
}
export async function ensureMonthlyPhotoStudioCredits({
  userId,
  kind = "studio_subscription",
  sourceId,
  allowance,
  periodStart,
  periodEnd,
  transaction,
}) {
  const start = new Date(periodStart),
    end = new Date(periodEnd);
  if (
    kind !== "studio_subscription" ||
    !sourceId ||
    !Number.isInteger(allowance) ||
    allowance < 1 ||
    !periodStart ||
    !periodEnd ||
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    end <= start
  ) {
    throw new Error("Invalid monthly credit grant");
  }
  return locked(userId, transaction, async (tx) => {
    // One bucket per subscription period: upgrades grant only the difference; downgrades never refill it.
    const grantKey = `studio:${sourceId}:${end.toISOString()}`;
    let bucket = await Bucket.findOne({
      where: { grantKey },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (bucket && bucket.userId !== userId)
      throw new Error("Credit grant belongs to another account");
    if (!bucket) {
      bucket = await Bucket.create(
        {
          userId,
          kind,
          sourceId,
          grantKey,
          allowance,
          remaining: allowance,
          reserved: 0,
          periodStart: start,
          periodEnd: end,
          expiresAt: end,
          status: "active",
        },
        { transaction: tx },
      );
      await grantEntry(bucket, allowance, `${grantKey}:grant:${allowance}`, tx);
    } else if (allowance > bucket.allowance && bucket.status === "active") {
      const difference = allowance - bucket.allowance;
      await bucket.update(
        { allowance, remaining: bucket.remaining + difference },
        { transaction: tx },
      );
      await grantEntry(
        bucket,
        difference,
        `${grantKey}:grant:${allowance}`,
        tx,
      );
    }
    return bucket;
  });
}
export async function ensureCurrentPhotoStudioCredits({
  userId,
  guestId,
  transaction,
}) {
  if (guestId) {
    if (
      !(await Bucket.findOne({
        where: { guestId, kind: "guest_trial" },
        transaction,
      }))
    )
      throw new Error("Guest trial grant is missing");
    return null;
  }
  return locked(userId, transaction, async (tx) => {
    await ensurePhotoStudioSignupCredits({ userId, transaction: tx });
    const sub = await PhotoStudioSubscription.findOne({
      where: { userId },
      transaction: tx,
    });
    if (subscriptionIsUsable(sub) && sub.stripeSubscriptionId) {
      const allowance = getPhotoStudioPlanAllowance(sub.planTier);
      if (allowance)
        await ensureMonthlyPhotoStudioCredits({
          userId,
          sourceId: sub.stripeSubscriptionId,
          allowance,
          periodStart: sub.currentPeriodStart,
          periodEnd: sub.currentPeriodEnd,
          transaction: tx,
        });
    }
    return sub;
  });
}
export async function expirePhotoStudioCreditBuckets({
  userId,
  transaction,
  now = new Date(),
}) {
  return locked(userId, transaction, async (tx) => {
    const buckets = await Bucket.findAll({
      where: {
        userId,
        status: "active",
        expiresAt: { [Op.lte]: now },
        reserved: 0,
      },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    for (const bucket of buckets) {
      if (bucket.remaining)
        await Ledger.create(
          {
            operationId: crypto.randomUUID(),
            userId,
            bucketId: bucket.id,
            type: "expire",
            amount: bucket.remaining,
            idempotencyKey: `${bucket.grantKey}:expire`,
          },
          { transaction: tx },
        );
      await bucket.update(
        { remaining: 0, status: "expired" },
        { transaction: tx },
      );
    }
    return buckets.length;
  });
}
async function availableBuckets(userId, tx, guestId = null) {
  if (guestId)
    return Bucket.findAll({
      where: { guestId, userId: null, kind: "guest_trial", status: "active" },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
  const sub = await ensureCurrentPhotoStudioCredits({
    userId,
    transaction: tx,
  });
  await expirePhotoStudioCreditBuckets({ userId, transaction: tx });
  const buckets = await Bucket.findAll({
    where: {
      userId,
      status: "active",
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    },
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });
  return buckets.filter(
    (bucket) =>
      ["signup", "claimed_trial"].includes(bucket.kind) ||
      (subscriptionIsUsable(sub) &&
        bucket.sourceId === sub.stripeSubscriptionId &&
        +new Date(bucket.periodEnd) === +new Date(sub.currentPeriodEnd)),
  );
}
const available = (bucket) => Math.max(0, bucket.remaining - bucket.reserved);
export async function getPhotoStudioCreditSummary({
  userId,
  guestId,
  transaction,
  completing = false,
}) {
  return locked(
    userId,
    transaction,
    async (tx) => {
      const buckets = await availableBuckets(userId, tx, guestId);
      const permanent = buckets
        .filter((b) => b.kind === "signup")
        .reduce((total, b) => total + available(b), 0);
      const monthly = buckets
        .filter((b) => b.kind === "studio_subscription")
        .reduce((total, b) => total + available(b), 0);
      const trial = buckets
        .filter((b) => ["guest_trial", "claimed_trial"].includes(b.kind))
        .reduce((sum, b) => sum + available(b), 0);
      return {
        permanent,
        monthly,
        ...(trial || guestId ? { trial } : {}),
        available: permanent + monthly + trial,
      };
    },
    guestId,
    completing,
  );
}
export async function reservePhotoStudioCredit({
  userId,
  guestId,
  chatId = null,
  agentMessageId = null,
  transaction,
}) {
  return locked(
    userId,
    transaction,
    async (tx) => {
      if (chatId) {
        const { PhotoStudioChat } = await import("../models/index.js");
        if (
          !(await PhotoStudioChat.findOne({
            where: {
              id: chatId,
              ...(guestId
                ? { guestId, userId: null }
                : { userId, guestId: null }),
            },
            transaction: tx,
          }))
        )
          throw new Error("Credit chat ownership mismatch");
      }
      if (agentMessageId) {
        const { PhotoStudioMessage } = await import("../models/index.js");
        if (
          !chatId ||
          !(await PhotoStudioMessage.findOne({
            where: { id: agentMessageId, chatId },
            transaction: tx,
          }))
        )
          throw new Error("Credit message ownership mismatch");
      }
      const buckets = await availableBuckets(userId, tx, guestId);
      const bucket = buckets
        .filter((b) => available(b) > 0)
        .sort(
          (a, b) =>
            ({
              studio_subscription: 0,
              guest_trial: 1,
              claimed_trial: 1,
              signup: 2,
            })[a.kind] -
            {
              studio_subscription: 0,
              guest_trial: 1,
              claimed_trial: 1,
              signup: 2,
            }[b.kind],
        )[0];
      if (!bucket) {
        const error = new Error("No Photo Studio credits available");
        error.code = guestId
          ? "GUEST_TRIAL_EXHAUSTED"
          : "NO_PHOTO_STUDIO_CREDITS";
        error.status = 402;
        throw error;
      }
      const operationId = crypto.randomUUID();
      await bucket.increment({ reserved: 1 }, { transaction: tx });
      await Ledger.create(
        {
          operationId,
          userId: userId || null,
          guestId: guestId || null,
          bucketId: bucket.id,
          chatId,
          agentMessageId,
          type: "reserve",
          amount: 1,
          idempotencyKey: `${operationId}:reserve`,
        },
        { transaction: tx },
      );
      if (guestId)
        await GuestSession.update(
          { lastWorkAt: new Date() },
          { where: { id: guestId }, transaction: tx },
        );
      return { operationId, bucketIds: [bucket.id] };
    },
    guestId,
  );
}
async function finish({ userId, guestId, operationId, transaction }, type) {
  return locked(
    userId,
    transaction,
    async (tx) => {
      const entries = await Ledger.findAll({
        where: {
          userId: userId || null,
          guestId: guestId || null,
          operationId,
        },
        transaction: tx,
      });
      const terminal = entries.find((entry) =>
        ["consume", "release"].includes(entry.type),
      );
      if (terminal) {
        if (terminal.type !== type)
          throw new Error(`Credit operation already ${terminal.type}d`);
        return type === "consume"
          ? { consumed: false, alreadyConsumed: true }
          : { released: false, alreadyReleased: true };
      }
      const reservation = entries.find((entry) => entry.type === "reserve");
      if (!reservation) throw new Error("Credit reservation was not found");
      const bucket = await Bucket.findOne({
        where: {
          id: reservation.bucketId,
          userId: userId || null,
          guestId: guestId || null,
        },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      if (!bucket || bucket.reserved < 1 || bucket.remaining < 1)
        throw new Error("Credit reservation is inconsistent");
      await bucket.decrement(
        type === "consume" ? { reserved: 1, remaining: 1 } : { reserved: 1 },
        { transaction: tx },
      );
      await Ledger.create(
        {
          operationId,
          userId: userId || null,
          guestId: guestId || null,
          bucketId: bucket.id,
          chatId: reservation.chatId,
          agentMessageId: reservation.agentMessageId,
          type,
          amount: 1,
          idempotencyKey: `${operationId}:${type}`,
        },
        { transaction: tx },
      );
      return type === "consume"
        ? { consumed: true, alreadyConsumed: false }
        : { released: true, alreadyReleased: false };
    },
    guestId,
    true,
  );
}
export const consumePhotoStudioCredit = (args) => finish(args, "consume");
export const releasePhotoStudioCredit = (args) => finish(args, "release");
