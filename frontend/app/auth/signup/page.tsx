import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
export const metadata: Metadata = { title: "Create an account | Fussy Panda", robots: { index: false, follow: false } };
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <AuthShell title="A fresh start." intro="Create your free account and make yourself at home."><AuthForm mode="signup" next={params.next} /></AuthShell>;
}
