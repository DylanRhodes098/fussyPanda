import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-forms";
export const metadata: Metadata = { title: "Reset password | Fussy Panda", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function PasswordUpdatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <AuthShell title="Choose a new password." intro="A fresh password for your Fussy Panda account."><ResetPasswordForm token={typeof params.token === "string" ? params.token : ""} /></AuthShell>;
}
