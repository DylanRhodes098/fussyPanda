import type { Metadata } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Plans | Fussy Panda" };
export default function PricingPage() {
  redirect("/photo-studio?billing=1");
}
