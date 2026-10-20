export const PHOTO_STUDIO_PRODUCT_KEY = "photo_studio";

export const PHOTO_STUDIO_PLANS = Object.freeze({
  BASIC: "basic",
  PRO: "pro",
  ENTERPRISE: "enterprise",
});

export const PHOTO_STUDIO_PLAN_ALLOWANCES = Object.freeze({
  [PHOTO_STUDIO_PLANS.BASIC]: 25,
  [PHOTO_STUDIO_PLANS.PRO]: 75,
  [PHOTO_STUDIO_PLANS.ENTERPRISE]: 150,
});

const PHOTO_STUDIO_PRICE_ENV_KEYS = Object.freeze({
  [PHOTO_STUDIO_PLANS.BASIC]: "STRIPE_PHOTO_STUDIO_BASIC_PRICE_ID",
  [PHOTO_STUDIO_PLANS.PRO]: "STRIPE_PHOTO_STUDIO_PRO_PRICE_ID",
  [PHOTO_STUDIO_PLANS.ENTERPRISE]: "STRIPE_PHOTO_STUDIO_ENTERPRISE_PRICE_ID",
});

export function normalizePhotoStudioPlan(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (Object.values(PHOTO_STUDIO_PLANS).includes(normalized)) {
    return normalized;
  }

  return null;
}

export function getPhotoStudioPlanAllowance(value) {
  const plan = normalizePhotoStudioPlan(value);

  return plan ? PHOTO_STUDIO_PLAN_ALLOWANCES[plan] : 0;
}

export function getPhotoStudioPriceId(value) {
  const plan = normalizePhotoStudioPlan(value);

  if (!plan) {
    throw new Error("Invalid Photo Studio plan");
  }

  const environmentKey = PHOTO_STUDIO_PRICE_ENV_KEYS[plan];

  const priceId = process.env[environmentKey];

  if (!priceId) {
    const error = new Error(`Missing ${environmentKey}`);
    error.code = "BILLING_NOT_CONFIGURED";
    throw error;
  }
  return priceId;
}

export function getPhotoStudioPlanFromPriceId(priceId) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PHOTO_STUDIO_BASIC_PRICE_ID) {
    return PHOTO_STUDIO_PLANS.BASIC;
  }

  if (priceId === process.env.STRIPE_PHOTO_STUDIO_PRO_PRICE_ID) {
    return PHOTO_STUDIO_PLANS.PRO;
  }

  if (priceId === process.env.STRIPE_PHOTO_STUDIO_ENTERPRISE_PRICE_ID) {
    return PHOTO_STUDIO_PLANS.ENTERPRISE;
  }

  return null;
}
