import { Router } from "express";
import { requireOwner } from "../../../lib/auth.js";
import {
  User,
  sequelize,
  PhotoStudioSubscription,
} from "../../../models/index.js";
import { getPhotoStudioCreditSummary } from "../../../lib/photoStudioCredits.js";
import { subscriptionIsUsable } from "../../../lib/photoStudioEntitlements.js";
import {
  getPhotoStudioPriceId,
  normalizePhotoStudioPlan,
  PHOTO_STUDIO_PLAN_ALLOWANCES,
} from "../../../lib/photoStudioPlans.js";
import { syncPhotoStudioSubscription } from "../../../lib/photoStudioSubscriptionSync.js";
import stripe from "../../../lib/stripe.js";
const router = Router();
// Public price catalogue; only Stripe's configured amounts are presented to visitors.
router.get("/plans", async (_req, res) => {
  const plans = await Promise.all(Object.entries(PHOTO_STUDIO_PLAN_ALLOWANCES).map(async ([key, credits]) => {
    const offer = { key, name: key[0].toUpperCase() + key.slice(1), credits, amount: null, currency: null, available: false };
    try {
      const price = await stripe.prices.retrieve(getPhotoStudioPriceId(key));
      if (!price.active || price.type !== "recurring" || price.recurring?.interval !== "month" || price.recurring?.interval_count !== 1 || !Number.isInteger(price.unit_amount)) return offer;
      return { ...offer, amount: price.unit_amount, currency: price.currency, available: true };
    } catch {
      return offer;
    }
  }));
  res.set("Cache-Control", "no-store").json({ plans });
});
router.use(requireOwner);
router.get("/me", async (req, res) => {
  const userId = req.auth.user.id;
  const record = await PhotoStudioSubscription.findOne({ where: { userId } });
  const tier =
    subscriptionIsUsable(record) ||
    ["past_due", "unpaid", "incomplete"].includes(record?.subscriptionStatus)
      ? record.planTier
      : "none";
  res.json({
    planTier: tier,
    effectivePlan:
      tier === "none" ? "Free" : tier[0].toUpperCase() + tier.slice(1),
    subscriptionStatus: record?.subscriptionStatus || "none",
    monthlyPrice: tier === "none" ? 0 : record.monthlyPrice,
    currentPeriodEnd: record?.currentPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(record?.cancelAtPeriodEnd),
    stripeCustomerId: record?.stripeCustomerId || null,
    hasStripeSubscription: Boolean(record?.stripeSubscriptionId),
    credits: await getPhotoStudioCreditSummary({ userId }),
  });
});
for (const action of ["change-plan", "cancel", "resume"])
  router.post(`/${action}`, async (req, res) => {
    const userId = req.auth.user.id;
    const result = await sequelize.transaction(async (transaction) => {
      await User.findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const record = await PhotoStudioSubscription.findOne({
        where: { userId },
        transaction,
      });
      if (!record?.stripeSubscriptionId)
        return res
          .status(400)
          .json({ message: "No Photo Studio subscription was found" });
      const current = await stripe.subscriptions.retrieve(
        record.stripeSubscriptionId,
        { expand: ["items.data.price"] },
      );
      if (
        current.metadata?.userId !== userId ||
        current.metadata?.application !== "fussy-panda" ||
        current.metadata?.product !== "photo_studio"
      )
        throw new Error("Subscription account mismatch");
      const values = { cancel_at_period_end: action === "cancel" };
      if (action === "change-plan") {
        const plan = normalizePhotoStudioPlan(req.body?.plan);
        if (!plan)
          return res
            .status(400)
            .json({ message: "Choose Basic, Pro or Enterprise" });
        if (record.planTier === plan)
          return res
            .status(409)
            .json({ message: "This plan is already active" });
        if (!current.items?.data?.[0])
          return res
            .status(400)
            .json({ message: "Subscription has no price item" });
        values.items = [
          { id: current.items.data[0].id, price: getPhotoStudioPriceId(plan) },
        ];
        values.proration_behavior = "always_invoice";
        values.payment_behavior = "error_if_incomplete";
      }
      const updated = await stripe.subscriptions.update(current.id, values);
      return syncPhotoStudioSubscription(updated, { userId, transaction });
    });
    if (!res.headersSent) res.json({ subscription: result });
  });
export default router;
