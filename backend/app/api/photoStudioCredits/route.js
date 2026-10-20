import { Router } from "express";
import { requirePhotoStudioAccess } from "../../../lib/photoStudioAccessGuard.js";
import { getPhotoStudioCreditSummary } from "../../../lib/photoStudioCredits.js";
import { getPhotoStudioEntitlements } from "../../../lib/photoStudioEntitlements.js";
import { creditOwner } from "../../../lib/studioOwner.js";
import { sendStudio } from "../../../lib/studioResponse.js";
const router = Router();
router.use(requirePhotoStudioAccess);
router.get("/", async (req, res) => {
  const actor = req.auth.user;
  const credits = await getPhotoStudioCreditSummary(creditOwner(actor));
  const { studioSubscription, ...entitlements } = actor.isGuest
    ? {}
    : await getPhotoStudioEntitlements(actor.id);
  return sendStudio(res, actor, { credits, entitlements });
});
export default router;
