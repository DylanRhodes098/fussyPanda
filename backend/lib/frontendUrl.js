export function getFrontendUrl() {
  const value =
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3001" : "");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("FRONTEND_URL must be an absolute URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid FRONTEND_URL");
  }
  if (
    process.env.NODE_ENV === "production" &&
    (url.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  ) {
    throw new Error("Production FRONTEND_URL must use a public HTTPS origin");
  }
  return url.origin;
}
export function getPasswordResetUrl(token) {
  const path = process.env.PASSWORD_RESET_PATH || "/auth/password-update";
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("PASSWORD_RESET_PATH must be a local path");
  const url = new URL(path, getFrontendUrl());
  if (url.origin !== getFrontendUrl())
    throw new Error("Invalid password reset origin");
  url.searchParams.set("token", token);
  return url.href;
}
