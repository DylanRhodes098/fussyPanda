import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
export const metadata: Metadata = { title: "Log in | Fussy Panda", robots: { index: false, follow: false } };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; expired?: string }> }) {
  const params = await searchParams;
  return <AuthShell title="Welcome back." intro="Log in to your Fussy Panda account."><AuthForm mode="login" next={params.next} reset={params.reset === "1"} expired={params.expired === "1"} /></AuthShell>;
}
