import { api, ApiError } from "./api";
import type {
  PhotoStudioChat,
  PhotoStudioChatSummary,
  PhotoStudioEnvironment,
  PhotoStudioPhoto,
  StudioStatus,
  Subscription,
  Plan,
  PlanOffer,
  Claim,
} from "./studio-types";

const id = encodeURIComponent;
export const studioApi = {
  session: () => api<{ studio: StudioStatus }>("/api/photoStudio/session"),
  startTrial: () =>
    api<{ studio: StudioStatus }>("/api/photoStudio/session", {
      method: "POST",
    }),
  claim: () =>
    api<{ studio: StudioStatus; guestClaim: Claim }>(
      "/api/photoStudio/session/claim",
      { method: "POST" },
    ),
  chats: () =>
    api<{
      chats: PhotoStudioChatSummary[];
      remainingSlots: number;
      studio: StudioStatus;
    }>("/api/photoStudioChats"),
  chat: (chatId: string) =>
    api<{ chat: PhotoStudioChat; studio: StudioStatus }>(
      `/api/photoStudioChats/${id(chatId)}`,
    ),
  create: (body: { title: string; sourcePhotoDataUrl: string }) =>
    api<{
      chat: PhotoStudioChat;
      remainingSlots: number;
      studio: StudioStatus;
    }>("/api/photoStudioChats", { method: "POST", body: JSON.stringify(body) }),
  source: (chatId: string, sourcePhotoDataUrl: string) =>
    api(`/api/photoStudioChats/${id(chatId)}/source`, {
      method: "POST",
      body: JSON.stringify({ sourcePhotoDataUrl }),
    }),
  generate: (chatId: string, instruction?: string) =>
    api<{ studio: StudioStatus }>(
      `/api/photoStudioChats/${id(chatId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ instruction }),
        signal: AbortSignal.timeout(660000),
      },
    ),
  removeChat: (chatId: string) =>
    api(`/api/photoStudioChats/${id(chatId)}`, { method: "DELETE" }),
  environment: () =>
    api<{ environment: PhotoStudioEnvironment | null; studio: StudioStatus }>(
      "/api/photoStudio/environment",
    ),
  uploadEnvironment: (environmentPhotoDataUrl: string) =>
    api<{ environment: PhotoStudioEnvironment; studio: StudioStatus }>(
      "/api/photoStudio/environment",
      { method: "PUT", body: JSON.stringify({ environmentPhotoDataUrl }) },
    ),
  save: (chatId: string, messageId: string) =>
    api<{ photo: PhotoStudioPhoto }>(
      `/api/photoStudioChats/${id(chatId)}/messages/${id(messageId)}/library`,
      { method: "POST" },
    ),
  library: () =>
    api<{ photos: PhotoStudioPhoto[] }>("/api/photoStudio/library"),
  removePhoto: (photoId: string) =>
    api(`/api/photoStudio/library/${id(photoId)}`, { method: "DELETE" }),
  subscription: () => api<Subscription>("/api/photoStudioSubscription/me"),
  plans: () =>
    api<{ plans: PlanOffer[] }>("/api/photoStudioSubscription/plans"),
  checkout: (plan: Plan) =>
    api<{ url: string }>("/api/photoStudioCheckout/session", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  portal: () =>
    api<{ url: string }>("/api/photoStudioCheckout/portal", { method: "POST" }),
  changePlan: (plan: Plan) =>
    api("/api/photoStudioSubscription/change-plan", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  cancel: () => api("/api/photoStudioSubscription/cancel", { method: "POST" }),
  resume: () => api("/api/photoStudioSubscription/resume", { method: "POST" }),
};

// Download authorization is fetched afresh for each click; previews are never original downloads.
export async function downloadOriginal(path: string, filename: string) {
  const { download } = await api<{
    download: { url: string; expiresIn: number };
  }>(path);
  const url = new URL(download.url);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Could not open the original photograph.");
  const response = await fetch(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      "The download link expired or is unavailable. Please try again for a fresh link.",
    );
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function studioError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return "Too many requests. Please wait a little before trying again.";
    if (
      error.status >= 500 &&
      error.data.code !== "PHOTO_STUDIO_GENERATION_FAILED"
    )
      return "Photo Studio is temporarily unavailable. Please try again later.";
  }
  return error instanceof Error
    ? error.message
    : "Something went wrong in Photo Studio.";
}
