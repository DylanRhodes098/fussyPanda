import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AccountPanel } from "@/components/auth/account-panel";
export const metadata: Metadata = { title: "Your account | Fussy Panda", robots: { index: false, follow: false } };
export default function AccountPage() {
  return <AuthShell title="Your little corner." intro="Your account, ready when you are."><AccountPanel /></AuthShell>;
}
