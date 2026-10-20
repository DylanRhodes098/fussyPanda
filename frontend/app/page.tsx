import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AccountLinks } from "@/components/auth/account-links";
import { ArrowRight, ImageIcon, Sparkles } from "lucide-react";
import panda from "@/public/img/fussyPanda/ChatGPT Image Sep 9, 2026, 04_41_32 PM.png";

export const metadata: Metadata = {
  title: "Fussy Panda | Menu-ready food photos",
  description: "Turn everyday food photos into polished images for your menu, website and social media.",
};

const steps = [
  { title: "Upload your dish", text: "Start with a normal photo of your food." },
  { title: "Let Fussy Panda work", text: "Transform it into a polished restaurant-quality image." },
  { title: "Use it anywhere", text: "Download your image and use it across menus, websites and social media." },
];

const buttonClass = "inline-flex min-h-12 items-center justify-center gap-3 rounded-full px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1F1F1F]";

function Brand() {
  return (
    <a href="#home" aria-label="Fussy Panda home" className="flex items-center gap-2 text-xl font-bold tracking-tight">
      <Image src={panda} alt="" width={56} height={56} className="h-14 w-14 object-contain" />
      <span>Fussy Panda<span className="text-[#ED8A7A]">.</span></span>
    </a>
  );
}

function PlaceholderLink({ children }: { children: string }) {
  return <span role="link" aria-disabled="true" title="Coming soon" className="cursor-default text-sm text-[#1F1F1F]/60">{children}</span>;
}

export default function FussyPandaHomePage() {
  return (
    <div id="home" className="min-h-screen bg-[#FFF4EC] font-sans text-[#1F1F1F] selection:bg-[#ED8A7A]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-white focus:p-4">Skip to content</a>
      <header className="mx-auto max-w-7xl px-6 sm:px-10">
        <nav aria-label="Main navigation" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-[#1F1F1F]/10 py-5">
          <Brand />
          <div className="flex flex-wrap items-center gap-5 sm:gap-8">
            <a href="#how-it-works" className="text-sm hover:underline">How it works</a>
            <Link href="/pricing" className="text-sm hover:underline">Pricing</Link>
            <AccountLinks />
            <Link href="/photo-studio" className={`${buttonClass} bg-[#ED8A7A] hover:bg-[#e57d6c]`}>Try it free <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </nav>
      </header>

      <main id="main">
        <section aria-labelledby="hero-title" className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-16 sm:px-10 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-28">
          <div>
            <p className="mb-6 flex items-center gap-2 text-xs font-semibold tracking-[0.18em]"><span className="h-2 w-2 rounded-full bg-[#ED8A7A]" />AI FOOD PHOTOGRAPHY</p>
            <h1 id="hero-title" className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-6xl">Turn everyday food photos into <span className="text-[#a94435]">menu-ready images.</span></h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-[#1F1F1F]/70">Upload a photo of your dish and Fussy Panda helps turn it into polished food photography ready for your menu, website and social media.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/photo-studio" className={`${buttonClass} bg-[#ED8A7A] hover:bg-[#e57d6c]`}>Try it free <ArrowRight size={16} aria-hidden="true" /></Link>
              <a href="#how-it-works" className={`${buttonClass} border border-[#1F1F1F]/20 hover:bg-white/60`}>See how it works</a>
            </div>
          </div>

          <figure className="rounded-[2rem] border border-[#1F1F1F]/10 bg-white/70 p-4 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3 px-1 text-sm"><span className="font-semibold">A little fuss. A big difference.</span><Sparkles size={19} aria-hidden="true" /></div>
            <div className="grid grid-cols-2 gap-3">
              {["Before", "After"].map((label) => (
                <div key={label} className={`flex aspect-[3/4] flex-col rounded-2xl p-3 sm:p-4 ${label === "After" ? "bg-[#ED8A7A]/25" : "bg-[#1F1F1F]/5"}`}>
                  <span className="self-start rounded-full bg-white/85 px-3 py-1 text-xs font-semibold">{label}</span>
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-[#1F1F1F]/55">
                    <ImageIcon size={32} strokeWidth={1} aria-hidden="true" />
                    <span className="max-w-24 text-xs leading-5">{label === "Before" ? "Your original photo" : "Your polished photo"}</span>
                  </div>
                </div>
              ))}
            </div>
            <figcaption className="mt-4 text-center text-xs text-[#1F1F1F]/60">Before & after preview · photos coming soon</figcaption>
          </figure>
        </section>

        <section id="how-it-works" aria-labelledby="steps-title" className="scroll-mt-8 border-y border-[#1F1F1F]/10 bg-white/45">
          <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10 sm:py-20">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em]">From your kitchen to your menu</p>
            <h2 id="steps-title" className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Better food photos in three simple steps.</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {steps.map((step, index) => (
                <article key={step.title} className="rounded-3xl border border-[#1F1F1F]/10 bg-[#FFF4EC] p-7 sm:p-8">
                  <span className="mb-8 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ED8A7A]/30 text-sm font-semibold">0{index + 1}</span>
                  <h3 className="text-xl font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#1F1F1F]/70">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="try-it" aria-labelledby="cta-title" className="mx-auto max-w-7xl scroll-mt-8 px-6 py-16 sm:px-10 sm:py-20">
          <div className="rounded-[2rem] bg-[#ED8A7A] px-6 py-14 text-center sm:px-12 sm:py-20">
            <h2 id="cta-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">Your food already looks good.<br />Let’s make the photos match.</h2>
            <Link href="/photo-studio" className={`${buttonClass} mt-8 bg-[#1F1F1F] text-[#FFF4EC] hover:bg-[#353535]`}>Try Fussy Panda <ArrowRight size={16} aria-hidden="true" /></Link>
            <p id="launch-note" className="mt-4 text-sm text-[#1F1F1F]/80">Five trial credits. No account needed to get started.</p>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col gap-6 border-t border-[#1F1F1F]/10 px-6 py-8 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Brand />
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-6">
            <a href="#home" className="text-sm hover:underline">Home</a>
            <Link href="/pricing" className="text-sm hover:underline">Pricing</Link>
            <PlaceholderLink>Privacy</PlaceholderLink>
            <PlaceholderLink>Terms</PlaceholderLink>
          </nav>
        </div>
        <p className="text-xs text-[#1F1F1F]/60">© 2026 Fussy Panda</p>
      </footer>
    </div>
  );
}
