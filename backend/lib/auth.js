import jwt from "jsonwebtoken";
import { User } from "../models/index.js";

export const SESSION_COOKIE = "fp_session";
const issuer = "fussy-panda";
const audience = "fussy-panda-backend";
export function validateAuthConfig() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error(
      "JWT_SECRET must be a new Fussy Panda secret of at least 32 characters",
    );
  }
  cookieOptions();
}
export function cookieOptions() {
  const sameSite = process.env.SESSION_SAME_SITE || "lax";
  if (!["lax", "strict", "none"].includes(sameSite))
    throw new Error("Invalid SESSION_SAME_SITE");
  const secure = process.env.NODE_ENV === "production";
  if (sameSite === "none" && !secure)
    throw new Error("SameSite none requires production HTTPS");
  return { httpOnly: true, secure, sameSite, path: "/" };
}
export function signToken(user) {
  return jwt.sign(
    { id: user.id, version: user.tokenVersion },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "7d",
      issuer,
      audience,
    },
  );
}
export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer,
    audience,
  });
}
export async function instance(req) {
  const header = req.headers.authorization;
  let token;
  if (header) {
    if (!header.startsWith("Bearer "))
      throw new Error("Invalid authorization header");
    token = header.slice(7);
  } else {
    const cookie = (req.headers.cookie || "")
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    token =
      cookie && decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1));
  }
  const payload = verifyToken(token);
  const user = await User.findByPk(payload.id);
  if (!user || user.tokenVersion !== payload.version)
    throw new Error("Invalid session");
  return { user, payload };
}
export async function requireOwner(req, res, next) {
  try {
    req.auth = await instance(req);
  } catch (error) {
    if (error.name?.startsWith("Sequelize")) return next(error);
    return res.status(401).json({ message: "Please log in to continue" });
  }
  next();
}
export function issueSession(res, user) {
  res.set("Cache-Control", "no-store");
  const token = signToken(user);
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return { token, user: user.toJSON() };
}
