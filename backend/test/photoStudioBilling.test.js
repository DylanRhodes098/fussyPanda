import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { api } from "./helpers.js";
process.env.STRIPE_SECRET_KEY = "sk_test_fussy_panda_fixture";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fussy_panda_fixture";
process.env.STRIPE_PHOTO_STUDIO_BASIC_PRICE_ID = "price_fp_basic";
process.env.STRIPE_PHOTO_STUDIO_PRO_PRICE_ID = "price_fp_pro";
process.env.STRIPE_PHOTO_STUDIO_ENTERPRISE_PRICE_ID = "price_fp_enterprise";
const sdk = new Stripe(process.env.STRIPE_SECRET_KEY);
let current;
let customers = 0;
let checkoutCalls = 0;
let priceMode = "valid";
const stripe = {
  prices: {
    async retrieve(id) {
      if (priceMode === "failure") throw new Error("Fixture Stripe failure");
      return { active: priceMode !== "inactive", type: "recurring", unit_amount: id === "price_fp_basic" ? 1234 : 5678, currency: "gbp", recurring: { interval: priceMode === "annual" ? "year" : "month", interval_count: 1 } };
    },
  },
  webhooks: sdk.webhooks,
  customers: {
    async create(values) {
      customers++;
      return { id: `cus_${values.metadata.userId}` };
    },
  },
  checkout: {
    sessions: {
      async retrieve() {
        return {
          id: "cs_test_fp",
          url: "https://checkout.example/test",
          status: "open",
        };
      },
      async create(values) {
        checkoutCalls++;
        assert.equal(
          values.subscription_data.metadata.application,
          "fussy-panda",
        );
        assert.ok(values.success_url.startsWith(process.env.FRONTEND_URL));
        return {
          id: "cs_test_fp",
          url: "https://checkout.example/test",
          status: "open",
        };
      },
    },
  },
  billingPortal: {
    sessions: {
      async create(values) {
        assert.ok(values.customer.startsWith("cus_"));
        return { url: "https://portal.example/test" };
      },
    },
  },
  subscriptions: {
    async retrieve(id) {
      assert.equal(id, current.id);
      return structuredClone(current);
    },
    async update(id, values) {
      assert.equal(id, current.id);
      current.cancel_at_period_end = values.cancel_at_period_end;
      if (values.items) {
        const price = values.items[0].price;
        current.items.data[0].price = {
          id: price,
          unit_amount: price === "price_fp_pro" ? 2900 : 900,
        };
      }
      return structuredClone(current);
    },
  },
};
mock.module("../lib/stripe.js", {
  defaultExport: stripe,
  namedExports: { getStripe: () => stripe },
});
const models = await import("../models/index.js");
const credits = await import("../lib/photoStudioCredits.js");
const { syncPhotoStudioSubscription } =
  await import("../lib/photoStudioSubscriptionSync.js");
test("Photo Studio billing, monthly credits and signed webhooks", async (t) => {
  const { request, signup } = await api(t);
  const a = await signup(),
    b = await signup();
  const userId = a.user.id,
    token = a.token;
  const now = Math.floor(Date.now() / 1000);
  current = {
    id: `sub_${crypto.randomUUID()}`,
    customer: `cus_${userId}`,
    status: "active",
    cancel_at_period_end: false,
    metadata: { application: "fussy-panda", product: "photo_studio", userId },
    items: {
      data: [
        {
          id: "si_test",
          price: { id: "price_fp_basic", unit_amount: 900 },
          current_period_start: now - 3600,
          current_period_end: now + 30 * 86400,
        },
      ],
    },
  };
  async function webhook(event) {
    const raw = JSON.stringify(event);
    const signature = sdk.webhooks.generateTestHeaderString({
      payload: raw,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    return request("/api/stripeWebhook", {
      method: "POST",
      raw,
      headers: { "stripe-signature": signature },
    });
  }
  const event = (
    type = "customer.subscription.updated",
    object = structuredClone(current),
    id = `evt_${crypto.randomUUID()}`,
  ) => ({ id, type, data: { object } });
  await t.test("public plan catalogue uses Stripe amounts and rejects unusable prices", async () => {
    const result = await request("/api/photoStudioSubscription/plans");
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.plans.map(plan => plan.credits), [25, 75, 150]);
    assert.equal(result.data.plans[0].amount, 1234);
    assert.equal(result.data.plans[0].currency, "gbp");
    assert.equal(result.data.plans[0].available, true);
    assert.equal(result.data.plans[0].priceId, undefined);
    for (const mode of ["inactive", "annual", "failure"]) {
      priceMode = mode;
      const unavailable = await request("/api/photoStudioSubscription/plans");
      assert.equal(unavailable.status, 200);
      assert.ok(unavailable.data.plans.every(plan => !plan.available && plan.amount === null));
    }
    priceMode = "valid";
  });
  await t.test(
    "checkout validates plan, creates dedicated customer once and portal is owner-scoped",
    async () => {
      assert.equal(
        (
          await request("/api/photoStudioCheckout/session", {
            method: "POST",
            body: { plan: "basic" },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request("/api/photoStudioCheckout/session", {
            method: "POST",
            token,
            body: { plan: "invalid" },
          })
        ).status,
        400,
      );
      const responses = await Promise.all([
        request("/api/photoStudioCheckout/session", {
          method: "POST",
          token,
          body: { plan: "basic" },
        }),
        request("/api/photoStudioCheckout/session", {
          method: "POST",
          token,
          body: { plan: "basic" },
        }),
      ]);
      assert.ok(responses.every((r) => r.status === 200));
      assert.equal(customers, 1);
      assert.equal(checkoutCalls, 1);
      assert.equal(
        (
          await request("/api/photoStudioCheckout/session", {
            method: "POST",
            token,
            body: { plan: "pro" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request("/api/photoStudioCheckout/portal", {
            method: "POST",
            token,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request("/api/photoStudioCheckout/portal", {
            method: "POST",
            token: b.token,
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "signed concurrent duplicate events grant monthly credits once",
    async () => {
      const e = event();
      const results = await Promise.all([webhook(e), webhook(e)]);
      assert.deepEqual(
        results.map((r) => r.status),
        [200, 200],
      );
      assert.deepEqual(results.map((r) => r.data.status).sort(), [
        "duplicate",
        "processed",
      ]);
      assert.equal(
        await models.StripeWebhookEvent.count({
          where: { stripeEventId: e.id },
        }),
        1,
      );
      assert.deepEqual(await credits.getPhotoStudioCreditSummary({ userId }), {
        permanent: 25,
        monthly: 25,
        available: 50,
      });
      assert.equal(
        (
          await request("/api/photoStudioCheckout/session", {
            method: "POST",
            token,
            body: { plan: "pro" },
          })
        ).status,
        409,
      );
      const bad = await request("/api/stripeWebhook", {
        method: "POST",
        raw: JSON.stringify(e),
        headers: { "stripe-signature": "bad" },
      });
      assert.equal(bad.status, 400);
    },
  );
  await t.test(
    "failed webhook transactions leave no processed marker and can retry",
    async () => {
      const e = event();
      const old = current.items.data[0].price.id;
      current.items.data[0].price.id = "price_unknown";
      assert.equal((await webhook(e)).status, 500);
      assert.equal(
        await models.StripeWebhookEvent.count({
          where: { stripeEventId: e.id },
        }),
        0,
      );
      current.items.data[0].price.id = old;
      assert.equal((await webhook(e)).status, 200);
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId })).monthly,
        25,
      );
    },
  );
  await t.test(
    "upgrade grants only difference; repeated changes cannot refill spent credits",
    async () => {
      const operation = await credits.reservePhotoStudioCredit({ userId });
      await credits.consumePhotoStudioCredit({
        userId,
        operationId: operation.operationId,
      });
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId })).monthly,
        24,
      );
      assert.equal(
        (
          await request("/api/photoStudioSubscription/change-plan", {
            method: "POST",
            token,
            body: { plan: "pro" },
          })
        ).status,
        200,
      );
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId })).monthly,
        74,
      );
      assert.equal(
        (
          await request("/api/photoStudioSubscription/change-plan", {
            method: "POST",
            token,
            body: { plan: "basic" },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request("/api/photoStudioSubscription/change-plan", {
            method: "POST",
            token,
            body: { plan: "pro" },
          })
        ).status,
        200,
      );
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId })).monthly,
        74,
      );
      assert.equal(
        await models.PhotoStudioCreditBucket.count({
          where: { userId, kind: "studio_subscription" },
        }),
        1,
      );
    },
  );
  await t.test(
    "cancel at period end retains access, resume works, failed payment disables monthly credits",
    async () => {
      assert.equal(
        (
          await request("/api/photoStudioSubscription/cancel", {
            method: "POST",
            token,
          })
        ).status,
        200,
      );
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId })).monthly,
        74,
      );
      assert.equal(
        (await request("/api/photoStudioSubscription/me", { token })).data
          .cancelAtPeriodEnd,
        true,
      );
      assert.equal(
        (
          await request("/api/photoStudioSubscription/resume", {
            method: "POST",
            token,
          })
        ).status,
        200,
      );
      current.status = "past_due";
      // Current Stripe invoice shape nests the subscription under parent.subscription_details.
      assert.equal(
        (
          await webhook(
            event("invoice.payment_failed", {
              parent: { subscription_details: { subscription: current.id } },
            }),
          )
        ).status,
        200,
      );
      assert.deepEqual(await credits.getPhotoStudioCreditSummary({ userId }), {
        permanent: 25,
        monthly: 0,
        available: 25,
      });
      current.status = "active";
      assert.equal(
        (
          await webhook(
            event("invoice.paid", {
              parent: { subscription_details: { subscription: current.id } },
            }),
          )
        ).status,
        200,
      );
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId })).monthly,
        74,
      );
    },
  );
  await t.test(
    "out-of-order events use current state and another product is ignored",
    async () => {
      const old = structuredClone(current);
      current.status = "canceled";
      assert.equal(
        (await webhook(event("customer.subscription.updated", old))).status,
        200,
      );
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId })).monthly,
        0,
      );
      const original = current.metadata;
      current.metadata = { product: "menu", userId };
      assert.equal((await webhook(event())).data.status, "ignored");
      current.metadata = original;
      await assert.rejects(
        syncPhotoStudioSubscription(current, { userId: b.user.id }),
      );
    },
  );
  await t.test(
    "renewal gets one fresh allowance and old buckets expire after reservations finish",
    async () => {
      current.status = "active";
      current.items.data[0].current_period_start = now - 60;
      current.items.data[0].current_period_end = now + 60 * 86400;
      await syncPhotoStudioSubscription(current);
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId })).monthly,
        75,
      );
      const bucket = await models.PhotoStudioCreditBucket.findOne({
        where: {
          userId,
          kind: "studio_subscription",
          periodEnd: new Date((now + 60 * 86400) * 1000),
        },
      });
      const reserved = await credits.reservePhotoStudioCredit({ userId });
      await bucket.update({ expiresAt: new Date(Date.now() - 1000) });
      assert.equal(await credits.expirePhotoStudioCreditBuckets({ userId }), 0);
      await credits.releasePhotoStudioCredit({
        userId,
        operationId: reserved.operationId,
      });
      assert.equal(await credits.expirePhotoStudioCreditBuckets({ userId }), 1);
      assert.equal((await bucket.reload()).status, "expired");
      assert.equal(
        (await credits.getPhotoStudioCreditSummary({ userId })).monthly,
        0,
      );
    },
  );
});
