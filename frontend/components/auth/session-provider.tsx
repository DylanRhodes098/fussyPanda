"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";

export type User = { id: string; email: string; ownerName?: string; authProvider: string };
export type Studio = { availableTokens: number; remainingTrialTokens: number };
export type GuestClaim = { status: string; code?: string };
export type AuthResponse = { user: User; studio: Studio; guestClaim?: GuestClaim };
type Status = "loading" | "authenticated" | "anonymous" | "error";
type Session = {
  user: User | null;
  status: Status;
  error: string;
  refresh: () => Promise<void>;
  accept: (response: AuthResponse) => void;
  logout: () => Promise<void>;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const version = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  const refresh = useCallback(async () => {
    const requestVersion = ++version.current;
    try {
      const data = await api<{ user: User }>("/api/user");
      if (version.current !== requestVersion) return;
      setUser(data.user); setStatus("authenticated"); setError("");
    } catch (err) {
      if (version.current !== requestVersion) return;
      setUser(null);
      if (err instanceof ApiError && err.status === 401) {
        setStatus("anonymous"); setError("");
      } else {
        setStatus("error"); setError(err instanceof Error ? err.message : "Unable to check your session.");
      }
    }
  }, []);

  useEffect(() => {
    // The initial remote session check updates state only after its request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const focus = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("fussy-panda-session");
      channel.current.onmessage = focus;
    }
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
      channel.current?.close(); channel.current = null;
    };
  }, [refresh]);

  const accept = useCallback((response: AuthResponse) => {
    ++version.current;
    setUser(response.user); setStatus("authenticated"); setError("");
    channel.current?.postMessage("changed");
  }, []);

  const logout = useCallback(async () => {
    try { await api("/api/user/logout", { method: "POST" }); }
    catch (err) { if (!(err instanceof ApiError && err.status === 401)) throw err; }
    ++version.current;
    setUser(null); setStatus("anonymous"); setError("");
    channel.current?.postMessage("changed");
  }, []);

  return <SessionContext.Provider value={{ user, status, error, refresh, accept, logout }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider is required");
  return session;
}
