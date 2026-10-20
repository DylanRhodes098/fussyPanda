import { Router } from "express";
import {
  requireOwner,
  SESSION_COOKIE,
  cookieOptions,
} from "../../../../lib/auth.js";
const router = Router();
router.post("/", requireOwner, async (req, res) => {
  await req.auth.user.increment("tokenVersion");
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  return res.json({ message: "Logged out successfully" });
});
export default router;
