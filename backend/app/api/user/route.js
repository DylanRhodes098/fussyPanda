import { Router } from "express";
import { requireOwner } from "../../../lib/auth.js";
import { userUpdate } from "../../../validation/user.js";
import login from "./login/route.js";
import register from "./register/route.js";
import logout from "./logout/route.js";
import oauth from "./oauth/route.js";
const router = Router();
router.use("/login", login);
router.use("/register", register);
router.use("/logout", logout);
router.use("/oauth", oauth);
router.get("/", requireOwner, (req, res) =>
  res.set("Cache-Control", "no-store").json({ user: req.auth.user.toJSON() }),
);
router.patch("/", requireOwner, async (req, res) => {
  const parsed = userUpdate.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      message: "Invalid profile details",
      errors: parsed.error.flatten(),
    });
  await req.auth.user.update(parsed.data);
  return res.json({ user: req.auth.user.toJSON() });
});
export default router;
