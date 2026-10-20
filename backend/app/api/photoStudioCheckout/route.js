import { Router } from "express";
import { requireOwner } from "../../../lib/auth.js";
import {
  User,
  sequelize,
  PhotoStudioSubscription,
} from "../../../models/index.js";
import { getFrontendUrl } from "../../../lib/frontendUrl.js";
import {
  normalizePhotoStudioPlan,
  getPhotoStudioPriceId,
} from "../../../lib/photoStudioPlans.js";
import { ensurePhotoStudioCustomer } from "../../../lib/photoStudioCustomerSync.js";
import stripe from "../../../lib/stripe.js";
const router = Router();
router.use(requireOwner);
router.post("/session", async (req, res) => {
  const user = req.auth.user;
  const plan = normalizePhotoStudioPlan(req.body?.plan);
  if (!plan)
    return res.status(400).json({ message: "Invalid Photo Studio plan" });
  const price = getPhotoStudioPriceId(plan);
  const record = await PhotoStudioSubscription.findOne({
    where: { userId: user.id },
  });
  if (
    record?.stripeSubscriptionId &&
    !["none", "canceled", "incomplete_expired"].includes(
      record.subscriptionStatus,
    )
  ) {
    return res
      .status(409)
      .json({ message: "Manage your existing Photo Studio subscription" });
  }
  const customer = await ensurePhotoStudioCustomer(user);
  const session = await sequelize.transaction(async (transaction) => {
    await User.findByPk(user.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const record = await PhotoStudioSubscription.findOne({
      where: { userId: user.id },
      transaction,
    });
    if (
      record.stripeSubscriptionId &&
      !["none", "canceled", "incomplete_expired"].includes(
        record.subscriptionStatus,
      )
    ) {
      throw Object.assign(new Error("Manage your existing subscription"), {
        status: 409,
      });
    }
    if (record.checkoutSessionId) {
      const previous = await stripe.checkout.sessions.retrieve(
        record.checkoutSessionId,
      );
      if (previous.status === "complete")
        throw Object.assign(
          new Error("Checkout completed; subscription confirmation is pending"),
          { status: 409 },
        );
      if (previous.status === "open") {
        if (record.checkoutPlan !== plan)
          throw Object.assign(
            new Error(
              "An existing checkout is open; complete it or wait for it to expire",
            ),
            { status: 409 },
          );
        return previous;
      }
    }
    const created = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        client_reference_id: user.id,
        line_items: [{ price, quantity: 1 }],
        metadata: {
          userId: user.id,
          product: "photo_studio",
          application: "fussy-panda",
        },
        subscription_data: {
          metadata: {
            userId: user.id,
            product: "photo_studio",
            application: "fussy-panda",
          },
        },
        success_url: `${getFrontendUrl()}/photo-studio?checkout=success`,
        cancel_url: `${getFrontendUrl()}/photo-studio?checkout=cancelled`,
      },
      {
        idempotencyKey: `fussy-panda:checkout:${user.id}:${plan}:${Math.floor(Date.now() / 60000)}`,
      },
    );
    await record.update(
      { checkoutSessionId: created.id, checkoutPlan: plan },
      { transaction },
    );
    return created;
  });
  res.json({ url: session.url, sessionId: session.id });
});
router.post("/portal", async (req, res) => {
  const record = await PhotoStudioSubscription.findOne({
    where: { userId: req.auth.user.id },
  });
  if (!record?.stripeCustomerId)
    return res.status(400).json({ message: "No billing customer was found" });
  const session = await stripe.billingPortal.sessions.create({
    customer: record.stripeCustomerId,
    return_url: `${getFrontendUrl()}/photo-studio`,
  });
  res.json({ url: session.url });
});
export default router;
