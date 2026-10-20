import { rateLimit } from "express-rate-limit";
import { GUEST_COOKIE } from "./guestTrial.js";
import { getFrontendUrl } from "./frontendUrl.js";
import { studioError } from "./studioOwner.js";
export function guestCsrf(req, _res, next) {
  const guestCookie = (req.headers.cookie || "")
    .split(";")
    .some((v) => v.trim().startsWith(`${GUEST_COOKIE}=`));
  const creates = req.path === "/api/photoStudio/session";
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    (guestCookie || creates)
  ) {
    if (
      req.headers.origin !== getFrontendUrl() ||
      req.headers["x-fussy-panda-csrf"] !== "1"
    ) {
      return next(
        studioError(
          "CSRF_REJECTED",
          "Send the configured frontend Origin and X-Fussy-Panda-CSRF: 1",
          403,
        ),
      );
    }
  }
  next();
}
export function creationLimiter() {
  return rateLimit({
    windowMs: Number(process.env.GUEST_CREATION_WINDOW_MS) || 86400000,
    limit: Number(process.env.GUEST_CREATION_IP_LIMIT) || 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      code: "GUEST_CREATION_RATE_LIMITED",
      message: "Too many guest trials from this network",
    },
  });
}
export function guestGenerationLimiter() {
  return rateLimit({
    windowMs: Number(process.env.GUEST_GENERATION_WINDOW_MS) || 900000,
    limit: Number(process.env.GUEST_GENERATION_IP_LIMIT) || 30,
    skip: (req) => !req.auth?.user.isGuest,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      code: "GUEST_GENERATION_RATE_LIMITED",
      message: "Too many guest generation requests; please try later",
    },
  });
}
// One limiter instance is shared by every generation endpoint; req.ip follows Express TRUST_PROXY.
export const sharedGuestGenerationLimiter = guestGenerationLimiter();
