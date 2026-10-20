"use client";

// Controller adapted from What's Good's PhotoStudioApp. The workspace/sidebar remain
// reusable components; session, claim and download behavior follows Fussy Panda's API.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { studioApi, studioError, downloadOriginal } from "@/lib/studio-api";
import type {
  Claim,
  PhotoStudioChat,
  PhotoStudioChatSummary,
  PhotoStudioEnvironment,
  PhotoStudioMessage,
  StudioStatus,
  Subscription,
} from "@/lib/studio-types";
import { useSession } from "@/components/auth/session-provider";
import PhotoStudioWorkspace from "./PhotoStudioWorkspace";
import PhotoStudioSideNav from "./PhotoStudioSideNav";
import PhotoStudioTopNav from "./PhotoStudioTopNav";
import PhotoStudioPricingModal from "./PhotoStudioPricingModal";
import PhotoStudioLibraryPanel from "./PhotoStudioLibraryPanel";
import StudioDialog from "./StudioDialog";

const chatGenerating = (chat: PhotoStudioChat | null) =>
  Boolean(chat?.messages.some((message) => message.status === "generating"));
type Props = { initialChatId?: string; embedded?: boolean; routeBase?: string };

export default function PhotoStudioApp(props: Props) {
  const { user, status } = useSession();
  // Clear owner-scoped state when login/logout or a cross-tab account switch occurs.
  return (
    <StudioController
      key={status === "loading" ? "loading" : user?.id || "guest"}
      {...props}
    />
  );
}

function StudioController({
  initialChatId,
  embedded = false,
  routeBase = "/photo-studio",
}: Props) {
  const { user, status, refresh: refreshAccount } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const [studio, setStudio] = useState<StudioStatus | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [chats, setChats] = useState<PhotoStudioChatSummary[]>([]);
  const [chat, setChat] = useState<PhotoStudioChat | null>(null);
  const [environment, setEnvironment] = useState<PhotoStudioEnvironment | null>(
    null,
  );
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [remainingSlots, setRemainingSlots] = useState(5);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<"new" | "ready" | "blocked" | "error">(
    "new",
  );
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [environmentUploading, setEnvironmentUploading] = useState(false);
  const [error, setError] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(
    () => search.get("billing") === "1",
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const loadVersion = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const serverGenerating = chatGenerating(chat);
  const activeGeneration = generating || serverGenerating;
  const returnChatId = chat?.id || initialChatId;
  const returnPath = returnChatId
    ? `${routeBase}/${encodeURIComponent(returnChatId)}`
    : routeBase;
  const authQuery = `?next=${encodeURIComponent(returnPath)}`;

  const handleError = useCallback(
    (err: unknown) => {
      if (!alive.current) return;
      setError(studioError(err));
      if (err instanceof ApiError) {
        if (err.status === 401 || (err.status === 402 && !user))
          setAuthOpen(true);
        if (err.status === 402 && user) setPricingOpen(true);
        if (err.data.studio) setStudio(err.data.studio as StudioStatus);
      }
    },
    [user],
  );

  const refreshNavigation = useCallback(async () => {
    const response = await studioApi.chats();
    if (!alive.current) return;
    setChats(response.chats);
    setRemainingSlots(response.remainingSlots);
    setStudio(response.studio);
  }, []);

  const refreshSubscription = useCallback(async () => {
    if (!user) return;
    const response = await studioApi.subscription();
    if (alive.current) setSubscription(response);
  }, [user]);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const current = () => alive.current && version === loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const response = await studioApi.session();
      if (!current()) return;
      setStudio(response.studio);
      setAccess("ready");
      if (user) {
        try {
          const claimed = await studioApi.claim();
          if (current()) {
            setClaim(claimed.guestClaim);
            setStudio(claimed.studio);
          }
        } catch (err) {
          if (err instanceof ApiError && err.data.guestClaim) {
            if (current()) setClaim(err.data.guestClaim as Claim);
          } else throw err;
        }
      }
      const [navigation, env, subscriptionResult, selectedResult] =
        await Promise.all([
          studioApi.chats(),
          studioApi.environment(),
          user ? studioApi.subscription() : Promise.resolve(null),
          initialChatId
            ? studioApi.chat(initialChatId).catch((err) => {
                if (err instanceof ApiError && err.status === 404) {
                  if (current())
                    setError(
                      "This chat is unavailable or belongs to another account.",
                    );
                  return null;
                }
                throw err;
              })
            : Promise.resolve(null),
        ]);
      if (!current()) return;
      setChats(navigation.chats);
      setRemainingSlots(navigation.remainingSlots);
      setStudio(navigation.studio);
      setEnvironment(env.environment);
      setSubscription(subscriptionResult);
      setChat(selectedResult?.chat || null);
    } catch (err) {
      if (!current()) return;
      if (err instanceof ApiError && err.data.code === "GUEST_SESSION_REQUIRED")
        setAccess("new");
      else if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 410)
      ) {
        setAccess("blocked");
        setError(studioError(err));
      } else {
        setAccess("error");
        setError(studioError(err));
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, [initialChatId, user]);

  useEffect(() => {
    if (status === "loading") return;
    // Initial state follows asynchronous session/ownership requests.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [status, load]);

  useEffect(() => {
    if (claim?.status !== "pending") return;
    let cancelled = false;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      if (++attempts > 10) {
        window.clearInterval(timer);
        return;
      }
      try {
        const response = await studioApi.claim();
        if (cancelled) return;
        setClaim(response.guestClaim);
        setStudio(response.studio);
        await refreshNavigation();
        if (initialChatId) setChat((await studioApi.chat(initialChatId)).chat);
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.data.guestClaim)
          setClaim(err.data.guestClaim as Claim);
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [claim?.status, initialChatId, refreshNavigation]);

  // Recover work after page reload or a timed-out generation request without resubmitting it.
  useEffect(() => {
    if (!chat?.id || !serverGenerating) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const chatId = chat.id;
    async function poll() {
      try {
        const response = await studioApi.chat(chatId);
        if (cancelled) return;
        setChat(response.chat);
        setStudio(response.studio);
        if (chatGenerating(response.chat)) timeout = setTimeout(poll, 2500);
        else await refreshNavigation();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && [401, 404, 410].includes(err.status)) {
          handleError(err);
          return;
        }
        timeout = setTimeout(poll, 5000);
      }
    }
    timeout = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [chat?.id, serverGenerating, handleError, refreshNavigation]);

  useEffect(() => {
    if (search.get("checkout") !== "success" || !user) return;
    let cancelled = false;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      if (++attempts > 12) {
        window.clearInterval(timer);
        return;
      }
      try {
        await refreshSubscription();
        if (!cancelled) await refreshNavigation();
      } catch {
        /* A webhook may still be arriving. */
      }
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [search, user, refreshSubscription, refreshNavigation]);

  async function perform(action: () => Promise<void>) {
    if (lock.current)
      throw new Error("Please wait for the current action to finish.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      handleError(err);
      throw new Error(studioError(err));
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        setGenerating(false);
        setEnvironmentUploading(false);
      }
    }
  }
  async function reload(chatId: string) {
    const response = await studioApi.chat(chatId);
    if (alive.current) {
      setChat(response.chat);
      setStudio(response.studio);
    }
  }
  async function generate(chatId: string, instruction?: string) {
    setGenerating(true);
    try {
      await studioApi.generate(chatId, instruction);
    } finally {
      // The authoritative server status decides whether retry or polling is appropriate.
      await Promise.allSettled([reload(chatId), refreshNavigation()]);
    }
  }
  async function createChat(input: {
    title: string;
    sourcePhotoDataUrl: string;
  }) {
    await perform(async () => {
      if (remainingSlots < 1)
        throw new Error(
          "Delete an existing chat before starting another. Saved library copies are kept.",
        );
      const response = await studioApi.create(input);
      if (!alive.current) return;
      setChat(response.chat);
      setStudio(response.studio);
      setRemainingSlots(response.remainingSlots);
      try {
        if (response.studio.availableTokens > 0)
          await generate(response.chat.id);
        else {
          await refreshNavigation();
          if (user) setPricingOpen(true);
          else setAuthOpen(true);
        }
      } finally {
        if (alive.current)
          router.replace(
            `${routeBase}/${encodeURIComponent(response.chat.id)}`,
          );
      }
    });
  }
  async function startTrial() {
    try {
      await perform(async () => {
        await studioApi.startTrial();
        await load();
      });
    } catch {
      /* The controller displays the failure and never silently creates another trial. */
    }
  }
  async function removeChat(chatId: string) {
    if (
      !window.confirm(
        "Delete this chat and its temporary photos? Saved library copies will be kept.",
      )
    )
      return;
    try {
      await perform(async () => {
        await studioApi.removeChat(chatId);
        await refreshNavigation();
        if (chat?.id === chatId) {
          setChat(null);
          router.push(routeBase);
        }
      });
    } catch {
      /* Error shown above the workspace. */
    }
  }
  function requireAccount(action: () => void) {
    if (studio?.authenticated && user) action();
    else setAuthOpen(true);
  }

  const closeSide = useCallback(() => setSideOpen(false), []);
  return (
    <div className="min-h-svh bg-[#fff4ec]">
      {!embedded && (
        <PhotoStudioTopNav
          menuOpen={sideOpen}
          onMenuClick={() => setSideOpen((value) => !value)}
          onLibraryClick={() => requireAccount(() => setLibraryOpen(true))}
          onBillingClick={() => setPricingOpen(true)}
        />
      )}
      {!embedded && access === "ready" && (
        <PhotoStudioSideNav
          chats={chats}
          selectedChatId={chat?.id || null}
          loading={loading}
          disabled={loading || busy || activeGeneration}
          open={sideOpen}
          remainingSlots={remainingSlots}
          onClose={closeSide}
          onCreateNew={() => {
            setChat(null);
            setError("");
            closeSide();
            router.push(routeBase);
          }}
          onSelectChat={(chatId) => {
            closeSide();
            router.push(`${routeBase}/${encodeURIComponent(chatId)}`);
          }}
          onDeleteChat={(chatId) => void removeChat(chatId)}
          onMyProfile={() =>
            router.push(user ? "/account" : `/auth/login${authQuery}`)
          }
          profileName={user?.ownerName || (user ? "My account" : "Guest trial")}
          profileDetail={user?.email || "Sign in to keep your work"}
        />
      )}
      <main
        className={`${embedded ? "" : "px-3 pb-10 pt-24 sm:px-6"} ${!embedded && access === "ready" ? "md:pl-[17.5rem]" : ""}`}
      >
        {!loading && access !== "ready" ? (
          <section className="mx-auto my-10 max-w-xl rounded-3xl border border-zinc-200 bg-white p-7 sm:p-10">
            <h1 className="text-3xl font-semibold tracking-tight">
              A little fuss. A better photo.
            </h1>
            <p className="mt-4 text-sm leading-7 text-zinc-600">
              Upload your food photo and refine it with a conversation. Try five
              image generations free. Sign in to download originals and save
              your favourites.
            </p>
            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-900"
              >
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {access === "new" && (
                <button
                  disabled={busy}
                  onClick={() => void startTrial()}
                  className="min-h-12 rounded-full bg-[#1f1f1f] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Starting…" : "Start my five-credit trial"}
                </button>
              )}
              {access === "error" && (
                <button
                  onClick={() => void load()}
                  className="rounded-full border border-zinc-300 px-5 py-3 text-sm"
                >
                  Try again
                </button>
              )}
              <Link
                href={`/auth/login${authQuery}`}
                className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold"
              >
                Log in
              </Link>
              <Link
                href={`/auth/signup${authQuery}`}
                className="px-2 py-3 text-sm underline"
              >
                Create an account
              </Link>
            </div>
          </section>
        ) : (
          <>
            <div className="mx-auto mb-4 max-w-6xl space-y-3">
              {search.get("checkout") === "success" && (
                <p
                  role="status"
                  className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"
                >
                  {subscription &&
                  ["active", "trialing"].includes(
                    subscription.subscriptionStatus,
                  )
                    ? `Your ${subscription.effectivePlan} subscription is active. Your available credits are shown below.`
                    : "You’ve returned from checkout. Credits appear after payment confirmation; confirmation may take a moment."}{" "}
                  <button
                    className="underline"
                    onClick={() => {
                      void Promise.all([
                        refreshNavigation(),
                        refreshSubscription(),
                      ]).catch(handleError);
                    }}
                  >
                    Refresh billing status
                  </button>
                </p>
              )}
              {search.get("checkout") === "cancelled" && (
                <p
                  role="status"
                  className="rounded-xl border border-zinc-200 bg-white p-4 text-sm"
                >
                  Checkout was cancelled. You can continue with your existing
                  credits.
                </p>
              )}
              {claim &&
                ["pending", "conflict", "unavailable"].includes(
                  claim.status,
                ) && (
                  <div
                    role="status"
                    className="rounded-xl bg-amber-50 p-4 text-sm leading-6"
                  >
                    {claim.status === "pending"
                      ? "Your trial work is still finishing. We’ll transfer it when it’s ready."
                      : claim.status === "conflict"
                        ? "This trial belongs to another account. Log in to that account to access it."
                        : "This trial is no longer available to transfer. Your account remains signed in."}
                    <button
                      onClick={() => void load()}
                      className="ml-2 underline"
                    >
                      Check again
                    </button>
                  </div>
                )}
              {studio && !studio.authenticated && (
                <p className="rounded-xl border border-[#ed8a7a]/40 bg-white p-4 text-sm leading-6">
                  {studio.trialExhausted
                    ? "Your trial credits are used. Your previews are still available."
                    : `${studio.remainingTrialTokens} trial credits remaining. Uploading photos is free.`}{" "}
                  <button
                    className="font-semibold underline"
                    onClick={() => setAuthOpen(true)}
                  >
                    Sign in to save and download originals
                  </button>
                </p>
              )}
              {studio?.authenticated && studio.availableTokens < 1 && (
                <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">
                  You’re out of credits. Your chats, library and downloads
                  remain available.{" "}
                  <button
                    onClick={() => setPricingOpen(true)}
                    className="font-semibold underline"
                  >
                    View plans
                  </button>
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 p-4 text-sm text-red-900"
                >
                  {error}
                  <button
                    onClick={() => setError("")}
                    className="ml-3 underline"
                  >
                    Dismiss
                  </button>
                </p>
              )}
            </div>
            <PhotoStudioWorkspace
              key={chat?.id || "new"}
              environment={environment}
              chat={chat}
              loading={loading || status === "loading"}
              generating={activeGeneration}
              environmentUploading={environmentUploading}
              errorMessage=""
              credits={studio?.availableTokens || 0}
              downloadEligible={Boolean(studio?.downloadEligible && user)}
              uploadDisabled={
                loading ||
                status === "loading" ||
                busy ||
                claim?.status === "pending"
              }
              onCreditsClick={() =>
                user ? setPricingOpen(true) : setAuthOpen(true)
              }
              onOpenLibrary={() => requireAccount(() => setLibraryOpen(true))}
              onCreateChat={createChat}
              onEnvironmentUpload={(dataUrl) =>
                perform(async () => {
                  setEnvironmentUploading(true);
                  const response = await studioApi.uploadEnvironment(dataUrl);
                  if (alive.current) setEnvironment(response.environment);
                })
              }
              onSourceUpload={(dataUrl) =>
                perform(async () => {
                  if (!chat) return;
                  await studioApi.source(chat.id, dataUrl);
                  await reload(chat.id);
                })
              }
              onGenerate={(instruction) =>
                perform(async () => {
                  if (chat) await generate(chat.id, instruction);
                })
              }
              onAddToLibrary={(message) =>
                perform(async () => {
                  if (!user || !studio?.authenticated) {
                    setAuthOpen(true);
                    return;
                  }
                  if (!chat) return;
                  await studioApi.save(chat.id, message.id);
                  await reload(chat.id);
                })
              }
              onDownload={(message: PhotoStudioMessage) =>
                perform(async () => {
                  if (!user || !studio?.authenticated) {
                    setAuthOpen(true);
                    return;
                  }
                  if (chat)
                    await downloadOriginal(
                      `/api/photoStudioChats/${encodeURIComponent(chat.id)}/messages/${encodeURIComponent(message.id)}/download`,
                      `fussy-panda-${message.sequence}.png`,
                    );
                })
              }
            />
          </>
        )}
      </main>
      {authOpen && (
        <StudioDialog
          title="Keep your photos, keep creating."
          onClose={() => setAuthOpen(false)}
        >
          <p className="text-sm leading-7 text-zinc-600">
            Create an account or log in to keep your trial work, save favourites
            and download original images. Your remaining trial credits transfer
            with your work.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/auth/signup${authQuery}`}
              className="rounded-full bg-[#1f1f1f] px-5 py-3 text-sm font-semibold text-white"
            >
              Create account
            </Link>
            <Link
              href={`/auth/login${authQuery}`}
              className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold"
            >
              Log in
            </Link>
            <button
              onClick={() => setAuthOpen(false)}
              className="px-2 text-sm underline"
            >
              Keep viewing previews
            </button>
          </div>
          {user && (
            <button
              className="mt-4 text-sm underline"
              onClick={() => {
                void refreshAccount();
              }}
            >
              Check my session
            </button>
          )}
        </StudioDialog>
      )}
      {libraryOpen && user && (
        <PhotoStudioLibraryPanel
          onClose={() => {
            setLibraryOpen(false);
            if (chat) void reload(chat.id).catch(handleError);
          }}
        />
      )}
      {pricingOpen && (
        <PhotoStudioPricingModal
          onClose={() => setPricingOpen(false)}
          authenticated={Boolean(user)}
          subscription={subscription}
          onChanged={async () => {
            await Promise.all([refreshNavigation(), refreshSubscription()]);
          }}
        />
      )}
    </div>
  );
}
