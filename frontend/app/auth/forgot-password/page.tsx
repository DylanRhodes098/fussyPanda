import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
export const metadata: Metadata = { title: "Forgot password | Fussy Panda", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() {
  return <AuthShell title="Forgot your password?" intro="We’ll email you a link to set a new one."><ForgotPasswordForm /></AuthShell>;
}
