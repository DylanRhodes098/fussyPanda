"use client";
import Link from "next/link";
import { useSession } from "./session-provider";

export function AccountLinks() {
  const { status } = useSession();
  if (status === "loading") return <span role="status" className="text-sm text-[#1f1f1f]/60">Checking account…</span>;
  return <Link href={status === "authenticated" ? "/account" : "/auth/login"} className="text-sm hover:underline">{status === "authenticated" ? "My account" : "Log in"}</Link>;
}
