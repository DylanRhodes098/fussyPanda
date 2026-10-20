"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { inputClass, submitClass } from "./auth-shell";
import { passwordError } from "./auth-form";
import { useSession } from "./session-provider";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    lock.current = true; setBusy(true); setError("");
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    {sent ? <div role="status"><h2 className="font-semibold">Check your inbox</h2><p className="mt-3 text-sm leading-6">If an account exists for that email, you’ll receive a password reset link. It expires in one hour. Check your spam folder too.</p><button type="button" onClick={() => setSent(false)} className="mt-5 text-sm underline underline-offset-4">Try another email</button></div> : <form onSubmit={submit} aria-busy={busy} className="space-y-5">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <div><label htmlFor="email" className="text-sm font-medium">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} className={inputClass} /></div>
      <button disabled={busy} className={submitClass}>{busy ? "Sending…" : "Send reset link"}</button>
    </form>}
    <p className="mt-6 text-center text-sm"><Link href="/auth/login" className="underline underline-offset-4">Back to login</Link></p>
  </>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const router = useRouter();
  const { refresh } = useSession();
  const valid = /^[a-f0-9]{64}$/.test(token);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const problem = passwordError(password);
    if (problem) { setError(problem); return; }
    if (password !== data.get("confirmPassword")) { setError("Your passwords don’t match."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      await refresh();
      router.replace("/auth/login?reset=1");
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!valid) return <div role="alert"><p className="text-sm leading-6">This reset link is incomplete or invalid. Request a new link to change your password.</p><Link href="/auth/forgot-password" className="mt-5 inline-block text-sm font-semibold underline underline-offset-4">Request a new reset link</Link></div>;
  return <form onSubmit={submit} aria-busy={busy} className="space-y-5">
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-900">{error} <Link href="/auth/forgot-password" className="underline">Request a new link</Link></div>}
    <fieldset disabled={busy} className="space-y-5">
      <div><label htmlFor="password" className="text-sm font-medium">New password</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} aria-describedby="password-help" className={inputClass} /><p id="password-help" className="mt-2 text-xs leading-5 text-[#1f1f1f]/65">Use 8–72 characters, including uppercase, lowercase and a number. Maximum 72 bytes.</p></div>
      <div><label htmlFor="confirmPassword" className="text-sm font-medium">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={72} className={inputClass} /></div>
      <button className={submitClass}>{busy ? "Updating…" : "Update password"}</button>
    </fieldset>
  </form>;
}
