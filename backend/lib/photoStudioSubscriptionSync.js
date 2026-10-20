import { User, PhotoStudioSubscription, sequelize } from "../models/index.js";
import { ensureMonthlyPhotoStudioCredits } from "./photoStudioCredits.js";
import { subscriptionIsUsable } from "./photoStudioEntitlements.js";
import {
  getPhotoStudioPlanFromPriceId,
  getPhotoStudioPlanAllowance,
} from "./photoStudioPlans.js";
export const stripeId = (value) =>
  typeof value === "string" ? value : value?.id || null;
export async function syncPhotoStudioSubscription(
  subscription,
  { userId, transaction } = {},
) {
  if (
    subscription?.metadata?.product !== "photo_studio" ||
    subscription?.metadata?.application !== "fussy-panda"
  ) {
    throw new Error("Subscription does not belong to Fussy Panda");
  }
  const owner = subscription.metadata.userId;
  if (!owner || (userId && userId !== owner))
    throw new Error("Subscription account mismatch");
  const run = async (tx) => {
    if (
      !(await User.findByPk(owner, { transaction: tx, lock: tx.LOCK.UPDATE }))
    )
      throw new Error("Subscription user not found");
    let record = await PhotoStudioSubscription.findOne({
      where: { userId: owner },
      transaction: tx,
    });
    if (
      record?.stripeCustomerId &&
      record.stripeCustomerId !== stripeId(subscription.customer)
    )
      throw new Error("Subscription customer mismatch");
    if (
      record?.stripeSubscriptionId &&
      record.stripeSubscriptionId !== subscription.id &&
      !["none", "canceled", "incomplete_expired"].includes(
        record.subscriptionStatus,
      )
    )
      throw new Error("Another subscription is already recorded");
    const item = subscription.items?.data?.[0];
    const planTier = getPhotoStudioPlanFromPriceId(stripeId(item?.price));
    if (!planTier) throw new Error("Unknown Photo Studio price");
    const start =
      item?.current_period_start ?? subscription.current_period_start;
    const end = item?.current_period_end ?? subscription.current_period_end;
    if (!start || !end || end <= start)
      throw new Error("Invalid subscription period");
    const values = {
      checkoutSessionId: null,
      checkoutPlan: null,
      userId: owner,
      stripeCustomerId: stripeId(subscription.customer),
      stripeSubscriptionId: subscription.id,
      stripePriceId: stripeId(item.price),
      planTier,
      subscriptionStatus: subscription.status,
      currentPeriodStart: new Date(start * 1000),
      currentPeriodEnd: new Date(end * 1000),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      monthlyPrice: (item.price?.unit_amount || 0) / 100,
    };
    record = record
      ? await record.update(values, { transaction: tx })
      : await PhotoStudioSubscription.create(values, { transaction: tx });
    if (subscriptionIsUsable(record))
      await ensureMonthlyPhotoStudioCredits({
        userId: owner,
        sourceId: subscription.id,
        allowance: getPhotoStudioPlanAllowance(planTier),
        periodStart: record.currentPeriodStart,
        periodEnd: record.currentPeriodEnd,
        transaction: tx,
      });
    return record;
  };
  return transaction ? run(transaction) : sequelize.transaction(run);
}
