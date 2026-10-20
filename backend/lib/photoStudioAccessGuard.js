import { instance, SESSION_COOKIE } from "./auth.js";
import { guestFromRequest } from "./guestTrial.js";
import { studioError } from "./studioOwner.js";
export async function requirePhotoStudioAccess(req, res, next) {
  try {
    const hasAuth =
      req.headers.authorization ||
      (req.headers.cookie || "")
        .split(";")
        .some((v) => v.trim().startsWith(`${SESSION_COOKIE}=`));
    if (hasAuth) {
      try {
        req.auth = await instance(req);
      } catch (error) {
        if (error.name?.startsWith("Sequelize")) throw error;
        throw studioError(
          "AUTHENTICATION_REQUIRED",
          "Please log in to continue",
          401,
        );
      }
    } else {
      const guest = await guestFromRequest(req);
      if (!guest)
        throw studioError(
          "GUEST_SESSION_REQUIRED",
          "Start a guest trial or log in",
          401,
        );
      req.auth = { user: { id: guest.id, isGuest: true } };
    }
    req.photoStudioUser = req.auth.user;
    next();
  } catch (error) {
    next(error);
  }
}
export function requireStudioAccount(req, _res, next) {
  if (req.auth?.user.isGuest)
    return next(
      studioError(
        "AUTHENTICATION_REQUIRED",
        "Log in and claim your work to download or save originals",
        401,
      ),
    );
  next();
}
