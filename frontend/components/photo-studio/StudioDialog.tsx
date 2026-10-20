"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function StudioDialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`m-auto max-h-[90svh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-[#fffaf6] p-5 text-[#1f1f1f] shadow-2xl backdrop:bg-black/50 sm:p-8 ${wide ? "max-w-5xl" : "max-w-xl"}`}
    >
      <header className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
        <button
          autoFocus
          aria-label={`Close ${title}`}
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white"
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
