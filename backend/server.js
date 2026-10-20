import "dotenv/config";
import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { pathToFileURL } from "node:url";
import { sequelize } from "./models/index.js";
import { validateAuthConfig } from "./lib/auth.js";
import { getFrontendUrl, getPasswordResetUrl } from "./lib/frontendUrl.js";
import { validateEmailConfig } from "./lib/email.js";
import userRoutes from "./app/api/user/route.js";
import authRoutes from "./app/api/auth/route.js";

import photoStudioRoutes from "./app/api/photoStudio/route.js";
import photoStudioChatsRoutes from "./app/api/photoStudioChats/route.js";
import photoStudioCreditsRoutes from "./app/api/photoStudioCredits/route.js";
import photoStudioSubscriptionRoutes from "./app/api/photoStudioSubscription/route.js";
import photoStudioCheckoutRoutes from "./app/api/photoStudioCheckout/route.js";
import stripeWebhookRoutes from "./app/api/stripeWebhook/route.js";
import { startPhotoStudioCleanup } from "./lib/photoStudioCleanup.js";

import { guestCsrf } from "./lib/guestSecurity.js";
import photoStudioSessionRoutes from "./app/api/photoStudioSession/route.js";

export function createApp() {
  validateAuthConfig();
  const frontendOrigin = getFrontendUrl();
  getPasswordResetUrl("configuration-check");
  if (process.env.NODE_ENV === "production") validateEmailConfig();
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
  // Reject cross-origin mutations, including requests carrying cookies.
  app.use((req, res, next) => {
    if (req.headers.origin && req.headers.origin !== frontendOrigin) {
      return res.status(403).json({ message: "Origin is not allowed" });
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["sec-fetch-site"] === "cross-site" &&
      !req.headers.origin
    ) {
      return res.status(403).json({ message: "Origin is required" });
    }
    next();
  });
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(guestCsrf);
  app.use(
    "/api/stripeWebhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    stripeWebhookRoutes,
  );
  app.use(
    ["/api/photoStudio", "/api/photoStudioChats"],
    express.json({ limit: "8mb" }),
  );
  app.use(express.json({ limit: "100kb" }));
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many account requests; please try again later" },
  });
  app.use(
    ["/api/user/login", "/api/user/register", "/api/user/oauth", "/api/auth"],
    limiter,
  );
  app.get("/health", (_req, res) =>
    res.json({ product: "fussy-panda", status: "ok" }),
  );
  app.use("/api/user", userRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/photoStudio/session", photoStudioSessionRoutes);
  app.use("/api/photoStudio", photoStudioRoutes);
  app.use("/api/photoStudioChats", photoStudioChatsRoutes);
  app.use("/api/photoStudioCredits", photoStudioCreditsRoutes);
  app.use("/api/photoStudioSubscription", photoStudioSubscriptionRoutes);
  app.use("/api/photoStudioCheckout", photoStudioCheckoutRoutes);
  app.use((_req, res) => res.status(404).json({ message: "Page not found" }));
  app.use((error, _req, res, _next) => {
    if (error.name === "SequelizeUniqueConstraintError")
      return res
        .status(409)
        .json({ message: "An account already uses this email or login" });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ message: "Invalid JSON body" });
    if (error.type === "entity.too.large")
      return res.status(413).json({ message: "Request is too large" });
    if (error.type === "StripeCardError")
      return res.status(402).json({
        message:
          "Payment requires attention; update your payment method in the billing portal",
      });
    if (
      ["GUEST_TRIAL_EXHAUSTED", "NO_PHOTO_STUDIO_CREDITS"].includes(error.code)
    )
      return res.status(402).json({ code: error.code, message: error.message });
    if (
      ["BILLING_NOT_CONFIGURED", "STUDIO_NOT_CONFIGURED"].includes(error.code)
    )
      return res.status(503).json({ message: error.message });
    if (error.status && error.status >= 400 && error.status < 500)
      return res
        .status(error.status)
        .json({ code: error.code, message: error.message });
    if (
      [
        "Invalid image upload",
        "Upload a JPG, PNG, or WebP image",
        "Uploaded image is empty",
        "Image must be smaller than 5MB",
        "Invalid or damaged image",
        "Unsupported image type",
        "Could not prepare image",
      ].includes(error.message)
    )
      return res.status(400).json({ message: error.message });
    console.error("Fussy Panda API error:", error.name);
    return res
      .status(500)
      .json({ message: "Something went wrong; please try again" });
  });
  return app;
}
export async function startServer() {
  const app = createApp();
  await sequelize.authenticate();
  const server = app.listen(Number(process.env.PORT || 4100), () =>
    console.info("Fussy Panda backend started"),
  );
  const stopCleanup = startPhotoStudioCleanup();
  server.once("close", stopCleanup);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close(async () => {
        await sequelize.close();
        process.exit(0);
      });
    });
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer().catch((error) => {
    console.error("Fussy Panda startup failed:", error.message);
    process.exit(1);
  });
}
