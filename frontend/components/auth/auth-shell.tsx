import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import panda from "@/public/img/fussyPanda/ChatGPT Image Sep 9, 2026, 04_41_32 PM.png";

export function AuthShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-svh max-w-6xl px-5 py-7 sm:px-10 sm:py-10">
      <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold tracking-tight" aria-label="Fussy Panda home">
        <Image src={panda} alt="" width={48} height={48} className="h-12 w-12 object-contain" />
        <span>Fussy Panda<span className="text-[#a94435]">.</span></span>
      </Link>
      <div className="mx-auto my-10 max-w-md sm:my-16">
        <div className="mb-7 text-center">
          <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-[#a94435]">A LITTLE FUSS. A BIG DIFFERENCE.</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 text-sm leading-6 text-[#1f1f1f]/70">{intro}</p>
        </div>
        <div className="rounded-3xl border border-[#1f1f1f]/10 bg-white/75 p-6 shadow-sm sm:p-8">{children}</div>
        <p className="mt-7 text-center text-sm"><Link href="/" className="text-[#1f1f1f]/65 underline underline-offset-4">Back to Fussy Panda</Link></p>
      </div>
    </main>
  );
}

export const inputClass = "mt-2 w-full rounded-xl border border-[#1f1f1f]/25 bg-white px-4 py-3 text-base disabled:opacity-60";
export const submitClass = "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#1f1f1f] px-5 py-3 text-sm font-semibold text-[#fff4ec] transition hover:bg-[#353535] disabled:cursor-wait disabled:opacity-60";
