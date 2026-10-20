import { claimGuest } from "../../../../lib/guestTrial.js";
import { studioStatus } from "../../../../lib/studioResponse.js";
import { Router } from "express";
import { sequelize, User } from "../../../../models/index.js";
import { userCreate } from "../../../../validation/user.js";
import { issueSession } from "../../../../lib/auth.js";
import { sendAccountCreatedEmails } from "../../../../lib/email.js";
import { ensurePhotoStudioSignupCredits } from "../../../../lib/photoStudioCredits.js";
const router = Router();
router.post("/", async (req, res) => {
  const parsed = userCreate.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      message: "Invalid account details",
      errors: parsed.error.flatten(),
    });
  let guestClaim;
  const user = await sequelize.transaction(async (transaction) => {
    const account = await User.create(parsed.data, { transaction });
    await ensurePhotoStudioSignupCredits({ userId: account.id, transaction });
    guestClaim = await claimGuest(req, account, { transaction });
    return account;
  });
  await sendAccountCreatedEmails(user);
  return res
    .status(201)
    .json({
      ...issueSession(res, user),
      guestClaim,
      studio: await studioStatus(user),
    });
});
export default router;
