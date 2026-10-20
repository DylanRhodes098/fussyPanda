"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type ResponsiveSideDrawerProps = {
  children: ReactNode;
  id: string;
  open: boolean;
  title: string;
  onClose: () => void;
  desktopTopClassName?: string;
};

export default function ResponsiveSideDrawer({
  children,
  id,
  open,
  title,
  onClose,
  desktopTopClassName = "md:pt-24",
}: ResponsiveSideDrawerProps) {
  useEffect(() => {
    if (!open) return;

    const mobileMedia = window.matchMedia("(max-width: 767px)");

    if (!mobileMedia.matches) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    function handleBreakpointChange(event: MediaQueryListEvent) {
      if (!event.matches) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    mobileMedia.addEventListener("change", handleBreakpointChange);

    return () => {
      document.body.style.overflow = previousOverflow;

      document.removeEventListener("keydown", handleKeyDown);

      mobileMedia.removeEventListener("change", handleBreakpointChange);
    };
  }, [onClose, open]);

  return (
    <>
      {open ? (
        <button
          aria-label={`Close ${title} navigation`}
          className="fixed inset-0 z-[1050] bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside
        aria-label={`${title} navigation`}
        className={`fixed inset-y-0 left-0 z-[1100] flex h-dvh w-[min(86vw,20rem)] flex-col border-r border-zinc-200 bg-white shadow-2xl transition duration-300 ease-out md:z-30 md:h-screen md:w-64 md:translate-x-0 md:shadow-none ${desktopTopClassName} ${
          open
            ? "pointer-events-auto visible translate-x-0"
            : "pointer-events-none invisible -translate-x-full md:pointer-events-auto md:visible"
        }`}
        id={id}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 px-4 md:hidden">
          <p className="font-semibold text-black">{title}</p>

          <button
            aria-label={`Close ${title} navigation`}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 hover:text-black"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </div>

        <div className="min-h-0 flex-1">{children}</div>
      </aside>
    </>
  );
}
