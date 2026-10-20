import { claimGuest } from "../../../../lib/guestTrial.js";
import { studioStatus } from "../../../../lib/studioResponse.js";
import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { sequelize, User } from "../../../../models/index.js";
import { issueSession } from "../../../../lib/auth.js";
import { ensurePhotoStudioSignupCredits } from "../../../../lib/photoStudioCredits.js";
import { sendAccountCreatedEmails } from "../../../../lib/email.js";
const router = Router();
router.post("/google", async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID)
    return res.status(503).json({ message: "Google login is not configured" });
  const credential = req.body?.credential;
  if (typeof credential !== "string" || !credential)
    return res.status(400).json({ message: "Missing Google credential" });
  let payload;
  try {
    const ticket = await new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
    ).verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true)
      throw new Error("Unverified email");
  } catch {
    return res
      .status(401)
      .json({ message: "Google login failed; please try again" });
  }
  let guestClaim;
  let user = await User.findOne({
    where: { authProvider: "google", providerId: payload.sub },
  });
  if (!user) {
    const existing = await User.findOne({
      where: { email: payload.email.toLowerCase() },
    });
    if (existing) {
      // Avoid silently linking a local account to a different login method.
      return res.status(409).json({
        message:
          "An account already uses this email. Please log in with your existing method.",
      });
    }
    user = await sequelize.transaction(async (transaction) => {
      const account = await User.create(
        {
          ownerName: payload.name,
          email: payload.email.toLowerCase(),
          authProvider: "google",
          providerId: payload.sub,
          password: null,
        },
        { transaction },
      );
      await ensurePhotoStudioSignupCredits({ userId: account.id, transaction });
      guestClaim = await claimGuest(req, account, { transaction });
      return account;
    });
    await sendAccountCreatedEmails(user);
  }
  guestClaim ||= await claimGuest(req, user);
  return res.json({
    ...issueSession(res, user),
    guestClaim,
    studio: await studioStatus(user),
  });
});
export default router;
