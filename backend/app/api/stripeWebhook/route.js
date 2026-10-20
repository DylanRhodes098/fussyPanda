import { Router } from "express";
import { sequelize, StripeWebhookEvent, User } from "../../../models/index.js";
import stripe from "../../../lib/stripe.js";
import {
  syncPhotoStudioSubscription,
  stripeId,
} from "../../../lib/photoStudioSubscriptionSync.js";
const router = Router();
async function currentSubscription(event) {
  const object = event.data.object;
  let id;
  if (event.type.startsWith("customer.subscription.")) id = object.id;
  else if (event.type === "checkout.session.completed")
    id = stripeId(object.subscription);
  else if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
    id = stripeId(
      object.subscription || object.parent?.subscription_details?.subscription,
    );
  }
  if (!id) return null;
  // Fetch current state so delayed/out-of-order events cannot restore an old plan or canceled access.
  return stripe.subscriptions.retrieve(id, { expand: ["items.data.price"] });
}
router.post("/", async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)
    return res.status(503).json({ message: "Billing is not configured" });
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return res.status(400).json({ message: "Invalid webhook signature" });
  }
  const duplicate = await StripeWebhookEvent.findOne({
    where: { stripeEventId: event.id },
  });
  if (duplicate) return res.json({ received: true, status: "duplicate" });
  const sub = await currentSubscription(event);
  if (
    !sub ||
    sub.metadata?.application !== "fussy-panda" ||
    sub.metadata?.product !== "photo_studio"
  ) {
    return res.json({ received: true, status: "ignored" });
  }
  const status = await sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(sub.metadata.userId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw new Error("Webhook account not found");
    if (
      await StripeWebhookEvent.findOne({
        where: { stripeEventId: event.id },
        transaction,
      })
    )
      return "duplicate";
    const latest = await currentSubscription(event);
    await syncPhotoStudioSubscription(latest, { transaction });
    await StripeWebhookEvent.create(
      { stripeEventId: event.id, type: event.type, processedAt: new Date() },
      { transaction },
    );
    return "processed";
  });
  res.json({ received: true, status });
});
export default router;
