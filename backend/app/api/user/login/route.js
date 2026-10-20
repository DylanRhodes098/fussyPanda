import { claimGuest } from "../../../../lib/guestTrial.js";
import { studioStatus } from "../../../../lib/studioResponse.js";
import { Router } from "express";
import { User } from "../../../../models/index.js";
import { issueSession } from "../../../../lib/auth.js";
import { login } from "../../../../validation/user.js";
const router = Router();
router.post("/", async (req, res) => {
  const parsed = login.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ message: "Valid email and password are required" });
  const user = await User.findOne({ where: { email: parsed.data.email } });
  if (!user || !(await user.checkPassword(parsed.data.password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const guestClaim = await claimGuest(req, user);
  return res.json({
    ...issueSession(res, user),
    guestClaim,
    studio: await studioStatus(user),
  });
});
export default router;
