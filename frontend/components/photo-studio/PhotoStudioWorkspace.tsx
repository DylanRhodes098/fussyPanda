"use client";

/* eslint-disable @next/next/no-img-element */
import PhotoStudioGenerationProgress from "./PhotoStudioGenerationProgress";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Download,
  ImagePlus,
  Library,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  Send,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";

import type { PhotoStudioEnvironment } from "@/lib/studio-types";
import type { PhotoStudioChat, PhotoStudioMessage } from "@/lib/studio-types";

const maximumImageSize = 5 * 1024 * 1024;

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function validateImage(file: File) {
  if (!supportedImageTypes.has(file.type)) {
    throw new Error("Upload a JPG, PNG or WebP image");
  }

  if (file.size > maximumImageSize) {
    throw new Error("Image must be smaller than 5MB");
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read the image"));
    };

    reader.onerror = () => {
      reject(new Error("Could not read the image"));
    };

    reader.readAsDataURL(file);
  });
}

function sourceNeedsAgentResponse(chat: PhotoStudioChat) {
  const generationInProgress = chat.messages.some(
    (message) => message.role === "agent" && message.status === "generating",
  );

  if (generationInProgress) {
    return false;
  }

  const latestSourceSequence =
    chat.messages
      .filter(
        (message) =>
          message.role === "user" &&
          message.type === "source_image" &&
          message.status === "completed",
      )
      .at(-1)?.sequence || 0;

  const latestCompletedAgentSequence =
    chat.messages
      .filter(
        (message) =>
          message.role === "agent" &&
          message.status === "completed" &&
          Boolean(message.imageUrl),
      )
      .at(-1)?.sequence || 0;

  return latestSourceSequence > latestCompletedAgentSequence;
}

function hasCompletedAgentImage(chat: PhotoStudioChat) {
  return chat.messages.some(
    (message) =>
      message.role === "agent" &&
      message.status === "completed" &&
      Boolean(message.imageUrl),
  );
}

type PhotoStudioWorkspaceProps = {
  environment: PhotoStudioEnvironment | null;
  chat: PhotoStudioChat | null;
  loading: boolean;
  generating: boolean;
  environmentUploading: boolean;
  errorMessage: string;
  onEnvironmentUpload: (dataUrl: string) => Promise<void>;
  onCreateChat: (input: {
    title: string;
    sourcePhotoDataUrl: string;
  }) => Promise<void>;
  onGenerate: (instruction?: string) => Promise<void>;
  onAddToLibrary: (message: PhotoStudioMessage) => Promise<void>;
  onOpenLibrary: () => void;
  onDownload: (message: PhotoStudioMessage) => Promise<void>;
  downloadEligible: boolean;
  uploadDisabled?: boolean;
  onSourceUpload: (dataUrl: string) => Promise<void>;
  credits: number;
  onCreditsClick: () => void;
};

export default function PhotoStudioWorkspace({
  credits,
  environment,
  chat,
  loading,
  generating,
  environmentUploading,
  errorMessage,
  onEnvironmentUpload,
  onCreateChat,
  onCreditsClick,
  onGenerate,
  onAddToLibrary,
  onOpenLibrary,
  onSourceUpload,
  onDownload,
  downloadEligible,
  uploadDisabled = false,
}: PhotoStudioWorkspaceProps) {
  const environmentInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const additionalSourceInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [pendingInstruction, setPendingInstruction] = useState<string | null>(
    null,
  );
  const [instruction, setInstruction] = useState("");
  const [localError, setLocalError] = useState("");
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [environmentPreviewOpen, setEnvironmentPreviewOpen] = useState(false);

  useEffect(() => {
    if (!environmentPreviewOpen) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setEnvironmentPreviewOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;

      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [environmentPreviewOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [chat?.messages.length, generating, pendingInstruction]);

  async function handleEnvironmentFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      setLocalError("");
      validateImage(file);
      await onEnvironmentUpload(await fileToDataUrl(file));
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Could not upload environment",
      );
    }
  }

  async function handleSourceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      setLocalError("");
      validateImage(file);

      const title =
        file.name
          .replace(/\.[^.]+$/, "")
          .trim()
          .slice(0, 80) || "New photo";

      await onCreateChat({
        title,
        sourcePhotoDataUrl: await fileToDataUrl(file),
      });
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Could not create photo",
      );
    }
  }

  async function handleAdditionalSourceFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      setLocalError("");
      validateImage(file);
      await onSourceUpload(await fileToDataUrl(file));
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "Could not upload another photograph",
      );
    }
  }

  async function submitInstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = instruction.trim();

    if (!value || generating) return;

    setInstruction("");
    setPendingInstruction(value);

    try {
      await onGenerate(value);
    } catch {
      // The parent displays the API error.
    } finally {
      setPendingInstruction(null);
    }
  }

  async function saveToLibrary(message: PhotoStudioMessage) {
    try {
      setSavingMessageId(message.id);
      await onAddToLibrary(message);
    } catch {
      // The parent controller displays the API error.
    } finally {
      setSavingMessageId(null);
    }
  }

  async function downloadImage(message: PhotoStudioMessage) {
    try {
      setLocalError("");
      await onDownload(message);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Could not download original",
      );
    }
  }

  const shownEnvironment = chat
    ? chat.environmentImageUrl
    : environment?.imageUrl || null;
  const initialResponseAvailable =
    Boolean(chat) && sourceNeedsAgentResponse(chat as PhotoStudioChat);
  const completedAgentImageAvailable = chat
    ? hasCompletedAgentImage(chat)
    : false;
  const latestCompletedAgentMessageId =
    chat?.messages
      .filter(
        (message) =>
          message.role === "agent" &&
          message.status === "completed" &&
          Boolean(message.imageUrl),
      )
      .at(-1)?.id || null;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 text-zinc-950 sm:gap-5">
      <header className="px-1 pb-1">
        <div className="flex items-center gap-3">
          <Sparkles className="shrink-0 text-[#a94435]" size={30} />

          <div>
            <h1 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">
              Photo Studio
            </h1>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Create and refine polished food photography. Add an environment if
              you’d like.
            </p>
          </div>
        </div>
      </header>

      <input
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleAdditionalSourceFile}
        ref={additionalSourceInputRef}
        type="file"
      />

      <section className="rounded-2xl border border-zinc-200/80 bg-white/95 p-4 shadow-[0_14px_40px_-32px_rgba(24,24,27,0.55)] backdrop-blur-sm sm:p-5">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <button
            aria-label={
              shownEnvironment
                ? "View restaurant environment full screen"
                : "No restaurant environment selected"
            }
            className="group relative h-36 w-full shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 text-left disabled:cursor-default sm:h-20 sm:w-28"
            disabled={!shownEnvironment}
            onClick={() => setEnvironmentPreviewOpen(true)}
            type="button"
          >
            {shownEnvironment ? (
              <>
                <img
                  alt="Restaurant environment"
                  className="h-full w-full object-cover"
                  src={shownEnvironment}
                />
                <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                  <Maximize2 size={15} />
                </span>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-400">
                <ImagePlus size={22} />
              </div>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-zinc-950">
              Environment (optional)
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {chat
                ? "This chat keeps the environment it started with. Changes apply to new photos."
                : "Optional: new photos can use this environment."}
            </p>
          </div>

          <input
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleEnvironmentFile}
            ref={environmentInputRef}
            type="file"
          />

          <button
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-50 sm:w-auto"
            disabled={environmentUploading || generating || uploadDisabled}
            onClick={() => environmentInputRef.current?.click()}
            type="button"
          >
            {environmentUploading ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Upload size={16} />
            )}
            {shownEnvironment ? "Change environment" : "Add environment"}
          </button>
        </div>
      </section>

      <section
        className={`flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-[0_18px_50px_-36px_rgba(24,24,27,0.5)] backdrop-blur-sm sm:rounded-3xl ${
          chat || loading ? "min-h-[560px] sm:min-h-[620px]" : ""
        }`}
      >
        <div className="flex flex-col gap-4 border-b border-zinc-100 px-5 pb-5 pt-6 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Sparkles className="shrink-0 text-[#a94435]" size={22} />
              <p className="text-lg font-semibold text-zinc-950">Photo agent</p>
            </div>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Upload your dish and refine it with a conversation. Each
              generation or refinement uses one credit.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-[#ed8a7a]/20 bg-[#fff4ec]/60 px-4 py-3">
            <span className="whitespace-nowrap text-sm font-semibold text-zinc-800">
              {credits} credits
            </span>

            <button
              className="rounded-full border border-[#ed8a7a]/40 bg-white px-4 py-2 text-sm font-semibold text-[#a94435] transition hover:border-[#a94435] hover:bg-[#fff4ec]"
              onClick={onCreditsClick}
              type="button"
            >
              Get more credits
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-5">
          <div className={chat ? "mx-auto max-w-4xl" : "w-full"}>
            {loading ? (
              <div className="flex min-h-96 items-center justify-center">
                <LoaderCircle
                  aria-label="Loading Photo Studio"
                  className="animate-spin text-[#a94435]"
                  size={32}
                />
              </div>
            ) : !chat ? (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.8fr)]">
                <div className="min-w-0">
                  <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#a94435]/50 bg-[#fff4ec]/20 px-6 py-10 text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ed8a7a]/20/70 text-[#a94435]">
                      <Upload size={28} />
                    </span>

                    <h2 className="mt-5 text-xl font-bold text-zinc-950">
                      Upload a food photograph
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      Upload one photo of the dish you want to refine.
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      JPG, PNG or WebP up to 5MB
                    </p>

                    <input
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleSourceFile}
                      ref={sourceInputRef}
                      type="file"
                    />

                    <button
                      className="mt-5 flex min-h-11 items-center gap-2 rounded-full bg-[#a94435] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a94435] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        generating || environmentUploading || uploadDisabled
                      }
                      onClick={() => sourceInputRef.current?.click()}
                      type="button"
                    >
                      <Upload size={17} />
                      Choose file
                    </button>

                    {!environment ? (
                      <p className="mt-3 text-sm font-medium text-amber-700">
                        An environment is optional. You can start with just your
                        dish photo.
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-start gap-3 px-2">
                    <Lightbulb
                      className="mt-0.5 shrink-0 text-[#a94435]"
                      size={20}
                    />
                    <div>
                      <p className="text-sm font-semibold text-zinc-800">
                        Tips for best results
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        Use a clear photo of the dish, taken from a similar
                        angle.
                      </p>
                    </div>
                  </div>
                </div>

                <aside className="border-t border-zinc-200 pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-3">
                  <h3 className="text-sm font-bold text-zinc-950">
                    How it works
                  </h3>
                  <ol className="mt-7 grid gap-7">
                    {[
                      {
                        icon: <Upload size={19} />,
                        title: "Upload your dish",
                        detail:
                          "Upload a clear photo of the dish you want to refine.",
                      },
                      {
                        icon: <Sparkles size={19} />,
                        title: "AI polishes your photo",
                        detail:
                          "Enhance your dish, optionally using your chosen environment.",
                      },
                      {
                        icon: <Download size={19} />,
                        title: "Review and download",
                        detail:
                          "Make any tweaks and download your polished photo.",
                      },
                    ].map((step, index) => (
                      <li className="flex gap-3" key={step.title}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fff4ec] text-[#a94435]">
                          {step.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs text-zinc-400">
                              {index + 1}
                            </span>
                            <p className="text-sm font-semibold text-zinc-950">
                              {step.title}
                            </p>
                          </div>
                          <p className="mt-1 text-sm leading-5 text-zinc-500">
                            {step.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </aside>
              </div>
            ) : (
              <div className="grid gap-6">
                {chat.messages.map((message) => {
                  if (
                    message.role === "user" &&
                    message.type === "source_image" &&
                    message.imageUrl
                  ) {
                    return (
                      <div
                        className="ml-auto w-fit max-w-[66%] sm:max-w-xs"
                        key={message.id}
                      >
                        <div className="overflow-hidden rounded-3xl rounded-br-md bg-white shadow-sm">
                          <img
                            alt="Original dish"
                            className="max-h-64 w-auto max-w-full object-contain"
                            src={message.imageUrl}
                          />
                        </div>
                      </div>
                    );
                  }

                  if (message.role === "user" && message.text) {
                    return (
                      <div
                        className="ml-auto max-w-[92%] break-words rounded-3xl rounded-br-md bg-[#a94435] px-4 py-3 text-sm leading-6 text-white sm:max-w-[78%] sm:px-5"
                        key={message.id}
                      >
                        {message.text}
                      </div>
                    );
                  }

                  if (
                    message.role === "agent" &&
                    message.status === "completed" &&
                    message.imageUrl
                  ) {
                    return (
                      <div
                        className="mr-auto w-fit max-w-[76%] sm:max-w-md"
                        key={message.id}
                      >
                        <div className="overflow-hidden rounded-3xl rounded-bl-md border border-zinc-200 bg-white shadow-sm">
                          <img
                            alt="Polished dish"
                            className="max-h-[22rem] w-auto max-w-full object-contain"
                            src={message.imageUrl}
                          />
                        </div>

                        <p className="mt-2 text-xs text-zinc-500">
                          Watermarked preview · originals available after
                          sign-in
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            className="flex min-h-9 items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-950 disabled:opacity-50"
                            disabled={
                              Boolean(message.libraryPhoto) ||
                              savingMessageId === message.id ||
                              uploadDisabled ||
                              generating
                            }
                            onClick={() => void saveToLibrary(message)}
                            type="button"
                          >
                            {savingMessageId === message.id ? (
                              <LoaderCircle
                                className="animate-spin"
                                size={15}
                              />
                            ) : (
                              <Library size={15} />
                            )}
                            {message.libraryPhoto
                              ? "In library"
                              : downloadEligible
                                ? "Add to library"
                                : "Sign in to save"}
                          </button>

                          <button
                            className="flex min-h-9 items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-950"
                            disabled={uploadDisabled}
                            onClick={() => void downloadImage(message)}
                            type="button"
                          >
                            <Download size={15} />
                            {downloadEligible
                              ? "Download original"
                              : "Sign in to download"}
                          </button>

                          {message.id === latestCompletedAgentMessageId ? (
                            <button
                              className="flex min-h-9 items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-950 disabled:opacity-50"
                              disabled={generating || uploadDisabled}
                              onClick={() =>
                                additionalSourceInputRef.current?.click()
                              }
                              type="button"
                            >
                              <Upload size={15} />
                              Upload another dish
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  }

                  if (message.role === "agent" && message.status === "failed") {
                    return (
                      <div
                        className="mr-auto rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                        key={message.id}
                      >
                        The photograph could not be generated. Your credit was
                        returned.
                      </div>
                    );
                  }

                  return null;
                })}

                {pendingInstruction ? (
                  <div className="ml-auto max-w-[92%] break-words rounded-3xl rounded-br-md bg-[#a94435] px-4 py-3 text-sm leading-6 text-white opacity-80 sm:max-w-[78%] sm:px-5">
                    {pendingInstruction}
                  </div>
                ) : null}

                {generating ? <PhotoStudioGenerationProgress /> : null}

                {initialResponseAvailable && !generating ? (
                  <button
                    className="mr-auto rounded-full bg-[#a94435] px-5 py-3 text-sm font-semibold text-white"
                    disabled={credits < 1 || uploadDisabled}
                    onClick={() => {
                      void onGenerate().catch(() => {
                        // The parent controller displays the API error.
                      });
                    }}
                    type="button"
                  >
                    Generate polished photograph
                  </button>
                ) : null}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {chat && completedAgentImageAvailable ? (
          <form
            className="border-t border-zinc-200 bg-white p-3 sm:p-5"
            onSubmit={submitInstruction}
          >
            <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-3xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-[#a94435] sm:gap-3">
              <textarea
                aria-label="Photo Studio instruction"
                className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-zinc-950 outline-none sm:px-3"
                disabled={generating || uploadDisabled}
                maxLength={500}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Ask Photo Studio to alter this photograph..."
                rows={1}
                value={instruction}
              />

              <button
                aria-label="Send instruction"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#a94435] text-white disabled:opacity-50"
                disabled={generating || credits < 1 || !instruction.trim()}
                type="submit"
              >
                {generating ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {!loading && !chat ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-[#ed8a7a]/20 bg-[#fff4ec]/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-start gap-4">
            <Star
              className="mt-0.5 shrink-0 fill-[#a94435] text-[#a94435]"
              size={24}
            />
            <div>
              <p className="text-sm font-semibold text-zinc-950">
                Consistency that elevates your menu
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Keep your menu photography on-brand with consistent lighting,
                angles and ambience.
              </p>
            </div>
          </div>

          <button
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#ed8a7a]/40 bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:border-[#a94435] hover:text-[#a94435]"
            onClick={onOpenLibrary}
            type="button"
          >
            <Library size={17} />
            View my library
          </button>
        </section>
      ) : null}

      {environmentPreviewOpen && shownEnvironment ? (
        <div
          aria-label="Restaurant environment preview"
          aria-modal="true"
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/90 p-3 sm:p-8"
          onClick={() => setEnvironmentPreviewOpen(false)}
          role="dialog"
        >
          <button
            aria-label="Close environment preview"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg sm:right-6 sm:top-6"
            onClick={() => setEnvironmentPreviewOpen(false)}
            type="button"
          >
            <X size={22} />
          </button>
          <img
            alt="Restaurant environment full-screen preview"
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
            src={shownEnvironment}
          />
        </div>
      ) : null}

      {localError || errorMessage ? (
        <div
          aria-live="polite"
          className="fixed bottom-3 left-3 right-3 z-50 rounded-2xl bg-red-700 px-4 py-3 text-sm text-white shadow-xl sm:bottom-5 sm:left-auto sm:right-5 sm:max-w-sm"
        >
          {localError || errorMessage}
        </div>
      ) : null}
    </section>
  );
}
