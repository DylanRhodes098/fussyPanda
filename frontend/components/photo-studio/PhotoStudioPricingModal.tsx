"use client";
// Plan-card and select-plan flow adapted from What's Good's PhotoStudioPricingModal.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { studioApi, studioError } from "@/lib/studio-api";
import type { Plan, PlanOffer, Subscription } from "@/lib/studio-types";
import StudioDialog from "./StudioDialog";

function redirectToStripe(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
  )
    throw new Error("The billing link is unavailable. Please try again.");
  window.location.assign(url.href);
}
function priceLabel(plan: PlanOffer) {
  if (plan.amount === null || !plan.currency) return "Currently unavailable";
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: plan.currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return `${formatter.format(plan.amount / 10 ** digits)} / month`;
}
export default function PhotoStudioPricingModal({
  onClose,
  authenticated,
  onChanged,
  subscription,
}: {
  onClose: () => void;
  authenticated: boolean;
  onChanged: () => Promise<void>;
  subscription: Subscription | null;
}) {
  const [plans, setPlans] = useState<PlanOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const managed = Boolean(
    subscription?.hasStripeSubscription &&
      !["none", "canceled", "incomplete_expired"].includes(
        subscription.subscriptionStatus,
      ),
  );
  useEffect(() => {
    let active = true;
    studioApi
      .plans()
      .then((data) => {
        if (active) setPlans(data.plans);
      })
      .catch((err) => {
        if (active) setError(studioError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function selectPlan(plan: Plan) {
    if (busy) return;
    if (
      managed &&
      !window.confirm(
        "Change your monthly plan? Stripe applies any immediate prorated charge. You can review billing details in the billing portal first.",
      )
    )
      return;
    setBusy(plan);
    setError("");
    try {
      if (managed) {
        await studioApi.changePlan(plan);
        await onChanged();
      } else redirectToStripe((await studioApi.checkout(plan)).url);
    } catch (err) {
      setError(studioError(err));
    } finally {
      setBusy("");
    }
  }
  async function manage(action: "portal" | "cancel" | "resume") {
    if (
      busy ||
      (action === "cancel" &&
        !window.confirm(
          "Cancel renewal at the end of your current billing period?",
        ))
    )
      return;
    setBusy(action);
    setError("");
    try {
      if (action === "portal") redirectToStripe((await studioApi.portal()).url);
      else {
        await studioApi[action]();
        await onChanged();
      }
    } catch (err) {
      setError(studioError(err));
    } finally {
      setBusy("");
    }
  }
  return (
    <StudioDialog title="Fussy Panda plans & billing" onClose={onClose} wide>
      <p className="mb-6 text-sm leading-6 text-zinc-600">
        Each generated image or refinement uses one credit. Monthly credits
        reset each billing period and do not roll over. Unused signup credits
        remain available.
      </p>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="flex items-center gap-2">
          <LoaderCircle className="animate-spin" size={18} />
          Loading plans…
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.key}
              className={`flex flex-col rounded-2xl border bg-white p-5 ${plan.key === "pro" ? "border-[#a94435]" : "border-zinc-200"}`}
            >
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              <p className="mt-4 text-xl font-semibold">{priceLabel(plan)}</p>
              <p className="my-5 flex items-center gap-2 text-sm">
                <Check size={18} className="text-[#a94435]" />
                {plan.credits} credits per month
              </p>
              {authenticated ? (
                <button
                  disabled={
                    Boolean(busy) ||
                    !plan.available ||
                    (managed && subscription?.planTier === plan.key)
                  }
                  onClick={() => void selectPlan(plan.key)}
                  className="mt-auto min-h-12 rounded-full bg-[#1f1f1f] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy === plan.key
                    ? "Please wait…"
                    : managed && subscription?.planTier === plan.key
                      ? "Current plan"
                      : managed
                        ? `Change to ${plan.name}`
                        : `Choose ${plan.name}`}
                </button>
              ) : (
                <Link
                  href="/auth/signup?next=%2Fphoto-studio%3Fbilling%3D1"
                  className="mt-auto rounded-full bg-[#1f1f1f] px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  Create an account
                </Link>
              )}
            </article>
          ))}
        </div>
      )}
      {!loading &&
        plans.length > 0 &&
        plans.every((plan) => !plan.available) && (
          <p role="status" className="mt-5 text-sm text-zinc-600">
            Subscriptions are currently unavailable. Please check back later.
          </p>
        )}
      {authenticated && subscription && (
        <section className="mt-7 border-t border-zinc-200 pt-5">
          <h3 className="font-semibold">
            Your subscription: {subscription.effectivePlan}
          </h3>
          <p className="mt-2 text-sm text-zinc-600">
            Status: {subscription.subscriptionStatus.replaceAll("_", " ")}
            {subscription.currentPeriodEnd
              ? ` · ${subscription.cancelAtPeriodEnd ? "Ends" : "Current period ends"} ${new Date(subscription.currentPeriodEnd).toLocaleDateString("en-GB")}`
              : ""}
          </p>
          <p className="mt-2 text-sm">
            {subscription.credits.monthly} monthly ·{" "}
            {subscription.credits.permanent} signup ·{" "}
            {subscription.credits.trial || 0} trial credits available
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {subscription.hasStripeSubscription && (
              <button
                disabled={Boolean(busy)}
                onClick={() => void manage("portal")}
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm"
              >
                Billing portal & invoices
              </button>
            )}
            {managed && (
              <button
                disabled={Boolean(busy)}
                onClick={() =>
                  void manage(
                    subscription.cancelAtPeriodEnd ? "resume" : "cancel",
                  )
                }
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm"
              >
                {subscription.cancelAtPeriodEnd
                  ? "Resume renewal"
                  : "Cancel renewal"}
              </button>
            )}
          </div>
        </section>
      )}
    </StudioDialog>
  );
}
