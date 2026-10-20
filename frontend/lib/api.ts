export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, public data: Record<string, unknown>) {
    super(typeof data.message === "string" ? data.message : "Something went wrong. Please try again.");
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      cache: "no-store",
      signal: options.signal || AbortSignal.timeout(40000),
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        "X-Fussy-Panda-CSRF": "1",
        ...options.headers,
      },
    });
  } catch {
    throw new Error("We couldn’t reach Fussy Panda. Check your connection and try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data);
  return data as T;
}

export function safeReturnPath(value?: string | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return "/account";
  try {
    const url = new URL(value, "https://fussy-panda.invalid");
    if (url.origin !== "https://fussy-panda.invalid" || url.pathname.startsWith("/auth")) return "/account";
    return url.pathname + url.search + url.hash;
  } catch { return "/account"; }
}
