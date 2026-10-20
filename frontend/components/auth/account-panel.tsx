"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession, type GuestClaim, type Studio } from "./session-provider";
import { submitClass } from "./auth-shell";

export function AccountPanel() {
  const { user } = useSession();
  // A cross-tab account switch must discard balances and claim state from the previous account.
  return <AccountContent key={user?.id || "signed-out"} />;
}

function AccountContent() {
  const { user, status, error: sessionError, refresh, logout } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [studio, setStudio] = useState<Studio | null>(null);
  const [claim, setClaim] = useState<GuestClaim | null>(null);
  const active = useRef(true);
  const claiming = useRef(false);

  const retryClaim = useCallback(async () => {
    if (claiming.current) return;
    claiming.current = true;
    try {
      const data = await api<{ guestClaim: GuestClaim; studio: Studio }>("/api/photoStudio/session/claim", { method: "POST" });
      if (active.current) { setClaim(data.guestClaim); setStudio(data.studio); setError(""); }
    } catch (err) {
      if (!active.current) return;
      if (err instanceof ApiError && err.data.guestClaim) {
        setClaim(err.data.guestClaim as GuestClaim);
        setStudio(err.data.studio as Studio);
      } else if (err instanceof ApiError && err.status === 401) {
        await refresh();
      } else setError(err instanceof Error ? err.message : "Unable to check your trial transfer.");
    } finally { claiming.current = false; }
  }, [refresh]);

  useEffect(() => {
    active.current = true;
    if (status === "anonymous") router.replace("/auth/login?next=%2Faccount&expired=1");
    // This starts a remote claim check; state updates follow its network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void retryClaim();
    return () => { active.current = false; };
  }, [status, router, retryClaim]);

  useEffect(() => {
    if (claim?.status !== "pending" || status !== "authenticated") return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (++attempts > 10) { window.clearInterval(timer); return; }
      void retryClaim();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [claim?.status, status, retryClaim]);

  async function signOut() {
    setBusy(true); setError("");
    try {
      await logout();
      window.google?.accounts.id.disableAutoSelect();
      router.replace("/auth/login");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to log out. Please try again."); }
    finally { setBusy(false); }
  }

  if (status === "error") return <div role="alert"><p className="text-sm leading-6">{sessionError}</p><button onClick={() => { void refresh(); }} className={`${submitClass} mt-5`}>Try again</button></div>;
  if (!user || status !== "authenticated") return <p role="status" className="text-sm">Checking your session…</p>;
  return <div className="space-y-6">
    <div><h2 className="text-xl font-semibold">Hello{user.ownerName ? `, ${user.ownerName}` : " there"}.</h2><p className="mt-2 break-all text-sm text-[#1f1f1f]/70">{user.email}</p><p className="mt-2 text-xs text-[#1f1f1f]/60">Signed in with {user.authProvider === "google" ? "Google" : "email and password"}</p></div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-900">{error}<button onClick={() => { void retryClaim(); }} className="ml-2 underline">Try again</button></div>}
    {claim?.status === "pending" && <div role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-6">You’re signed in. Your trial work is still finishing; we’ll transfer it when it’s ready.<button onClick={() => { void retryClaim(); }} className="mt-2 block font-semibold underline">Check transfer again</button></div>}
    {claim?.status === "conflict" && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm leading-6">This trial is linked to another account. Log in to that account to access its work.</p>}
    {claim?.status === "unavailable" && <p role="status" className="text-sm leading-6">This trial is no longer available to transfer. Your account is still signed in.</p>}
    {(claim?.status === "claimed" || claim?.status === "already_claimed") && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-900">Your trial work is linked to this account.</p>}
    {studio && <div className="rounded-2xl bg-[#fff4ec] p-5"><p className="text-sm text-[#1f1f1f]/65">Available credits</p><p className="mt-1 text-3xl font-semibold">{studio.availableTokens}</p>{studio.remainingTrialTokens > 0 && <p className="mt-2 text-xs text-[#1f1f1f]/65">Includes {studio.remainingTrialTokens} remaining trial credits.</p>}</div>}
    <div className="flex flex-wrap gap-4 text-sm font-semibold"><Link href="/photo-studio" className="underline underline-offset-4">Open Photo Studio</Link><Link href="/photo-studio?billing=1" className="underline underline-offset-4">Plans & billing</Link></div>
    <Link href="/auth/forgot-password" className="inline-block text-sm underline underline-offset-4">Reset your password</Link>
    <div><button onClick={() => { void signOut(); }} disabled={busy} className={submitClass}>{busy ? "Logging out…" : "Log out"}</button><p className="mt-2 text-center text-xs text-[#1f1f1f]/60">Logs you out on all devices.</p></div>
  </div>;
}
