import { Router } from "express";
import { requireOwner, instance } from "../../../lib/auth.js";
import { requirePhotoStudioAccess } from "../../../lib/photoStudioAccessGuard.js";
import { createGuest, claimGuest } from "../../../lib/guestTrial.js";
import { creationLimiter } from "../../../lib/guestSecurity.js";
import { studioStatus } from "../../../lib/studioResponse.js";
const router = Router();
router.post("/", creationLimiter(), async (req, res) => {
  // Explicit creation only. Existing account sessions keep their account flow.
  if (
    req.headers.authorization ||
    (req.headers.cookie || "").includes("fp_session=")
  ) {
    const { user } = await instance(req);
    return res
      .set("Cache-Control", "no-store")
      .json({ studio: await studioStatus(user) });
  }
  const actor = await createGuest(req, res);
  res
    .set("Cache-Control", "no-store")
    .json({ studio: await studioStatus(actor) });
});
router.get("/", requirePhotoStudioAccess, async (req, res) =>
  res
    .set("Cache-Control", "no-store")
    .json({ studio: await studioStatus(req.auth.user) }),
);
router.post("/claim", requireOwner, async (req, res) => {
  const guestClaim = await claimGuest(req, req.auth.user);
  const status =
    guestClaim.status === "pending" || guestClaim.status === "conflict"
      ? 409
      : guestClaim.status === "unavailable"
        ? 410
        : 200;
  res
    .set("Cache-Control", "no-store")
    .status(status)
    .json({
      guestClaim,
      code: guestClaim.code,
      studio: await studioStatus(req.auth.user),
    });
});
export default router;
