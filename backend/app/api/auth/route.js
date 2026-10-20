import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { Op } from "sequelize";
import { PasswordResetToken, User, sequelize } from "../../../models/index.js";
import { email, password } from "../../../validation/user.js";
import { sendPasswordResetEmail } from "../../../lib/email.js";
import { getPasswordResetUrl } from "../../../lib/frontendUrl.js";
import { SESSION_COOKIE, cookieOptions } from "../../../lib/auth.js";
const router = Router();
const genericMessage =
  "If an account exists for that email, a reset link has been sent.";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
router.get("/config", (_req, res) => {
  res.set("Cache-Control", "no-store").json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  });
});
router.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email }).safeParse(req.body);
  if (!parsed.success) return res.json({ message: genericMessage });
  try {
    const user = await User.findOne({ where: { email: parsed.data.email } });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      await sequelize.transaction(async (transaction) => {
        await user.reload({ transaction, lock: transaction.LOCK.UPDATE });
        await PasswordResetToken.update(
          { usedAt: new Date() },
          { where: { userId: user.id, usedAt: null }, transaction },
        );
        await PasswordResetToken.create(
          {
            userId: user.id,
            tokenHash: hash(rawToken),
            expiresAt: new Date(Date.now() + 3600000),
          },
          { transaction },
        );
      });
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl: getPasswordResetUrl(rawToken),
      });
    }
  } catch {
    console.error("Fussy Panda password reset email could not be sent");
  }
  return res.json({ message: genericMessage });
});
router.post("/reset-password", async (req, res) => {
  const parsed = z
    .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      message: "Invalid password reset request",
      errors: parsed.error.flatten(),
    });
  try {
    await sequelize.transaction(async (transaction) => {
      const tokenHash = hash(parsed.data.token);
      const candidate = await PasswordResetToken.findOne({
        where: { tokenHash },
        transaction,
      });
      if (!candidate) throw new Error("RESET_TOKEN_INVALID");
      const user = await User.findByPk(candidate.userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const resetToken = await PasswordResetToken.findOne({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { [Op.gt]: new Date() },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user || !resetToken) throw new Error("RESET_TOKEN_INVALID");
      await user.update(
        { password: parsed.data.password, tokenVersion: user.tokenVersion + 1 },
        { transaction },
      );
      await PasswordResetToken.update(
        { usedAt: new Date() },
        { where: { userId: user.id, usedAt: null }, transaction },
      );
    });
  } catch (error) {
    if (error.message !== "RESET_TOKEN_INVALID") throw error;
    return res
      .status(400)
      .json({ message: "Reset link is invalid or has expired" });
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  return res.json({
    message: "Password reset. Please log in with your new password.",
  });
});
export default router;
