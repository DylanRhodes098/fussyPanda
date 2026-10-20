"use client";

/* eslint-disable @next/next/no-img-element */

import { Camera, LoaderCircle, Plus, Trash2, UserRound } from "lucide-react";

import ResponsiveSideDrawer from "@/components/shared/ResponsiveSideDrawer";
import type { PhotoStudioChatSummary } from "@/lib/studio-types";

type Props = {
  chats: PhotoStudioChatSummary[];
  selectedChatId: string | null;
  loading: boolean;
  disabled: boolean;
  open: boolean;
  remainingSlots: number;
  onClose: () => void;
  onCreateNew: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onMyProfile: () => void;
  profileActive?: boolean;
  profileName?: string;
  profileDetail?: string;
};

export default function PhotoStudioSideNav({
  chats,
  selectedChatId,
  loading,
  disabled,
  open,
  remainingSlots,
  onClose,
  onCreateNew,
  onSelectChat,
  onDeleteChat,
  onMyProfile,
  profileActive = false,
  profileName = "My Profile",
  profileDetail = "Photo Studio account",
}: Props) {
  const createNewSelected = !profileActive && selectedChatId === null;

  return (
    <ResponsiveSideDrawer
      id="photo-studio-side-drawer"
      onClose={onClose}
      open={open}
      title="Photo Studio"
      desktopTopClassName="md:pt-20"
    >
      <nav
        aria-label="Photo Studio chats"
        className="flex h-full min-h-0 flex-col bg-white"
      >
        <div className="p-5 pt-6">
          <button
            className={`flex min-h-12 w-full items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              createNewSelected
                ? "border-[#ed8a7a]/40 bg-[#fff4ec]/60 text-[#a94435]"
                : "border-zinc-200 text-zinc-700 hover:border-[#ed8a7a]/40 hover:bg-[#fff4ec]/40 hover:text-[#a94435]"
            }`}
            disabled={disabled || remainingSlots === 0}
            onClick={onCreateNew}
            type="button"
          >
            <Plus className="shrink-0" size={17} />
            <span className="min-w-0 flex-1">Create new photo</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
              {remainingSlots}/5
            </span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#a94435]/50">
            Previous chats
          </p>

          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-zinc-500">
              <LoaderCircle className="animate-spin" size={17} />
              Loading chats
            </div>
          ) : chats.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center">
              <Camera className="mx-auto text-zinc-400" size={22} />
              <p className="mt-2 text-sm text-zinc-500">No photographs yet</p>
            </div>
          ) : (
            <div className="grid gap-1">
              {chats.map((chat) => {
                const selected = chat.id === selectedChatId;

                return (
                  <div
                    className={`group flex items-center gap-2 rounded-xl ${
                      selected ? "bg-[#fff4ec]" : "hover:bg-zinc-50"
                    }`}
                    key={chat.id}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 px-1 py-2 text-left"
                      disabled={disabled}
                      onClick={() => onSelectChat(chat.id)}
                      type="button"
                    >
                      <img
                        alt=""
                        className="h-11 w-12 shrink-0 rounded-lg object-cover"
                        src={chat.sourceImageUrl}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-zinc-950">
                          {chat.title}
                        </span>
                        <span className="mt-1 block text-xs text-zinc-500">
                          {new Date(chat.lastMessageAt).toLocaleDateString(
                            "en-GB",
                          )}
                        </span>
                      </span>
                    </button>
                    <button
                      aria-label={`Delete ${chat.title}`}
                      className="mr-2 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white hover:text-red-600 disabled:opacity-50"
                      disabled={disabled}
                      onClick={() => onDeleteChat(chat.id)}
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 p-5">
          <button
            className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition ${
              profileActive
                ? "bg-[#fff4ec] text-[#a94435]"
                : "text-zinc-700 hover:text-zinc-950"
            }`}
            onClick={onMyProfile}
            type="button"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
              {profileName.trim().charAt(0).toUpperCase() || (
                <UserRound size={17} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-zinc-950">
                {profileName}
              </span>
              <span className="mt-0.5 block truncate text-xs text-zinc-500">
                {profileDetail}
              </span>
            </span>
            <span aria-hidden="true" className="text-lg text-zinc-400">
              ›
            </span>
          </button>
        </div>
      </nav>
    </ResponsiveSideDrawer>
  );
}
