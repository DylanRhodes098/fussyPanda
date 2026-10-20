"use client";

import Image from "next/image";
import Link from "next/link";
import { Library, Menu } from "lucide-react";

import panda from "@/public/img/fussyPanda/ChatGPT Image Sep 9, 2026, 04_41_32 PM.png";

type Props = {
  menuOpen: boolean;
  onMenuClick: () => void;
  onLibraryClick: () => void;
  onBillingClick: () => void;
};

export default function PhotoStudioTopNav({
  menuOpen,
  onMenuClick,
  onLibraryClick,
  onBillingClick,
}: Props) {
  return (
    <header className="fixed inset-x-0 top-0 z-[1000] w-full border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="flex h-20 items-center">
        <div className="hidden h-full w-64 shrink-0 items-center border-r border-zinc-200 px-6 md:flex">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <Image
              alt=""
              className="h-10 w-10 object-contain"
              width={40}
              height={40}
              src={panda}
            />
            Fussy Panda<span className="text-[#a94435]">.</span>
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              aria-controls="photo-studio-side-drawer"
              aria-expanded={menuOpen}
              aria-label="Open Photo Studio navigation"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-black shadow-sm transition hover:bg-zinc-50 md:hidden"
              onClick={onMenuClick}
              type="button"
            >
              <Menu size={19} />
            </button>

            <Link href="/" className="text-sm font-bold sm:hidden">
              Fussy Panda.
            </Link>

            <span className="hidden whitespace-nowrap font-serif text-base text-zinc-950 sm:block">
              <Link href="/">
                Fussy Panda<span className="text-[#a94435]">.</span>
              </Link>
            </span>
            <span className="hidden text-zinc-400 sm:block">/</span>
            <span className="hidden whitespace-nowrap text-sm font-semibold text-zinc-700 sm:block">
              Photo Studio
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <button
              onClick={onBillingClick}
              className="min-h-10 rounded-full border border-zinc-200 px-3 text-sm font-semibold"
            >
              Plans
            </button>
            <button
              aria-label="Open Photo Studio library"
              className="flex min-h-10 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-950 transition hover:border-[#a94435] hover:text-[#a94435] sm:px-5"
              onClick={onLibraryClick}
              type="button"
            >
              <Library size={16} />
              <span className="hidden sm:inline">Library</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
