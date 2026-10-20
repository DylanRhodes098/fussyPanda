import { getPhotoStudioCreditSummary } from "./photoStudioCredits.js";
import { creditOwner } from "./studioOwner.js";
export async function studioStatus(actor, { completing = false } = {}) {
  const credits = await getPhotoStudioCreditSummary({ ...creditOwner(actor), completing });
  return {
    status: actor.isGuest ? "guest" : "authenticated",
    authenticated: !actor.isGuest,
    availableTokens: credits.available,
    remainingTrialTokens: actor.isGuest
      ? credits.available
      : credits.trial || 0,
    trialExhausted: actor.isGuest && credits.available === 0,
    downloadEligible: !actor.isGuest,
  };
}
// Whitelist response data rather than forwarding provider, storage, ledger or ownership internals.
const allowed = new Set([
  "id",
  "title",
  "status",
  "role",
  "type",
  "text",
  "sequence",
  "parentAgentMessageId",
  "imageUrl",
  "sourceImageUrl",
  "environmentImageUrl",
  "generatedImageUrl",
  "createdAt",
  "updatedAt",
  "lastMessageAt",
  "generatedAt",
  "savedAt",
  "retryCount",
  "messages",
  "libraryPhoto",
]);
export function studioRecord(record) {
  if (record == null) return null;
  if (Array.isArray(record)) return record.map(studioRecord);
  const value = record.toJSON ? record.toJSON() : record;
  const result = {};
  for (const [key, item] of Object.entries(value))
    if (allowed.has(key)) {
      result[key] = ["messages", "libraryPhoto"].includes(key)
        ? studioRecord(item)
        : item;
    }
  return result;
}
export async function sendStudio(res, actor, payload, status = 200) {
  // Middleware validated this request before work began; let an in-flight response finish across expiry.
  const result = { ...payload, studio: await studioStatus(actor, { completing: true }) };
  for (const key of [
    "environment",
    "generation",
    "photo",
    "photos",
    "chat",
    "chats",
    "sourceMessage",
    "userMessage",
    "agentMessage",
  ]) {
    if (key in result) result[key] = studioRecord(result[key]);
  }
  res.set("Cache-Control", "no-store");
  return res.status(status).json(result);
}
