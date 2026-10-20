import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import "./global.css";
import { SessionProvider } from "@/components/auth/session-provider";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Fussy Panda | Menu-ready food photos",
  description:
    "Turn everyday food photos into polished images for your menu, website and social media.",
  applicationName: "Fussy Panda",
  icons: {
    icon: "/img/fussyPanda/ChatGPT%20Image%20Sep%209%2C%202026%2C%2004_41_32%20PM.png",
  },
};

export default function FussyPandaLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="fussy-panda"><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
