import { PhotoStudioSubscription } from "../models/index.js";
import { getPhotoStudioPlanAllowance } from "./photoStudioPlans.js";
export function subscriptionIsUsable(record, now = new Date()) {
  return Boolean(
    record &&
    ["active", "trialing"].includes(record.subscriptionStatus) &&
    record.currentPeriodStart &&
    record.currentPeriodEnd &&
    new Date(record.currentPeriodStart) <= now &&
    new Date(record.currentPeriodEnd) > now,
  );
}
export async function getPhotoStudioEntitlements(userId, { transaction } = {}) {
  const studioSubscription = await PhotoStudioSubscription.findOne({
    where: { userId },
    transaction,
  });
  const studioAllowance = subscriptionIsUsable(studioSubscription)
    ? getPhotoStudioPlanAllowance(studioSubscription.planTier)
    : 0;
  return {
    studioAllowance,
    effectiveMonthlyAllowance: studioAllowance,
    effectiveSource: studioAllowance ? "studio" : "none",
    studioSubscription,
  };
}
