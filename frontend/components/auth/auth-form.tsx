"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, safeReturnPath } from "@/lib/api";
import { inputClass, submitClass } from "./auth-shell";
import { GoogleSignIn } from "./google-sign-in";
import { useSession, type AuthResponse } from "./session-provider";

export function passwordError(password: string) {
  if (password.length < 8 || password.length > 72 || new TextEncoder().encode(password).length > 72) return "Use a password between 8 and 72 bytes long.";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) return "Include an uppercase letter, a lowercase letter and a number.";
  return "";
}

export function AuthForm({ mode, next, reset = false, expired = false }: { mode: "login" | "signup"; next?: string; reset?: boolean; expired?: boolean }) {
  const signup = mode === "signup";
  const { status, accept } = useSession();
  const router = useRouter();
  const destination = safeReturnPath(next);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const errorBox = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace(destination);
  }, [status, router, destination]);
  useEffect(() => { if (error) errorBox.current?.focus(); }, [error]);

  async function authenticate(path: string, body: Record<string, string>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await api<AuthResponse>(path, { method: "POST", body: JSON.stringify(body) });
      accept(response);
      router.replace(destination);
    } catch (err) {
      let message = err instanceof Error ? err.message : "Please try again.";
      if (err instanceof ApiError && err.status === 400 && signup) message += " Check your email and password requirements below.";
      setError(message);
    } finally { lock.current = false; setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    if (signup) {
      const problem = passwordError(password);
      if (problem) { setError(problem); return; }
      if (password !== data.get("confirmPassword")) { setError("Your passwords don’t match."); return; }
    }
    const body: Record<string, string> = { email: String(data.get("email") || "").trim(), password };
    const name = String(data.get("ownerName") || "").trim();
    if (signup && name) body.ownerName = name;
    void authenticate(`/api/user/${signup ? "register" : "login"}`, body);
  }

  if (status === "authenticated") return <p role="status">You’re signed in. Opening your account…</p>;
  return <>
    {reset && <p role="status" className="mb-5 rounded-xl bg-green-50 p-3 text-sm text-green-900">Your password has been updated. Log in with your new password.</p>}
    {expired && <p role="status" className="mb-5 text-sm leading-6">Your session has ended. Please log in again.</p>}
    {error && <p ref={errorBox} tabIndex={-1} role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-900">{error}</p>}
    <GoogleSignIn disabled={busy || status === "loading"} onCredential={credential => { void authenticate("/api/user/oauth/google", { credential }); }} />
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy || status === "loading"} className="space-y-5">
        {signup && <div><label htmlFor="ownerName" className="text-sm font-medium">Your name <span className="font-normal text-[#1f1f1f]/60">(optional)</span></label><input id="ownerName" name="ownerName" autoComplete="name" maxLength={255} className={inputClass} /></div>}
        <div><label htmlFor="email" className="text-sm font-medium">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} className={inputClass} /></div>
        <div><label htmlFor="password" className="text-sm font-medium">Password</label><input id="password" name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 8 : 1} maxLength={signup ? 72 : 1000} aria-describedby={signup ? "password-help" : undefined} className={inputClass} />
          {signup && <p id="password-help" className="mt-2 text-xs leading-5 text-[#1f1f1f]/65">Use 8–72 characters, including uppercase, lowercase and a number. Some symbols and non-English characters count towards a 72-byte limit.</p>}
        </div>
        {signup && <div><label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={72} className={inputClass} /></div>}
        {!signup && <p className="text-right text-sm"><Link href="/auth/forgot-password" className="underline underline-offset-4">Forgot password?</Link></p>}
        <button type="submit" className={submitClass}>{busy ? "Please wait…" : status === "loading" ? "Checking session…" : signup ? "Create account" : "Log in"}</button>
      </fieldset>
    </form>
    <p className="mt-6 text-center text-sm text-[#1f1f1f]/70">{signup ? "Already have an account?" : "New to Fussy Panda?"} <Link href={`/auth/${signup ? "login" : "signup"}?next=${encodeURIComponent(destination)}`} className="font-semibold text-[#1f1f1f] underline underline-offset-4">{signup ? "Log in" : "Create an account"}</Link></p>
  </>;
}
