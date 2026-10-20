import { GuestSession, User } from "../models/index.js";
export const ownerWhere = (actor) =>
  actor.isGuest
    ? { userId: null, guestId: actor.id }
    : { userId: actor.id, guestId: null };
export const creditOwner = ownerWhere;
export const actorFor = (record) =>
  record.guestId
    ? { id: record.guestId, isGuest: true }
    : { id: record.userId, isGuest: false };
export const studioError = (code, message, status = 409) =>
  Object.assign(new Error(message), { code, status });
export async function lockStudioOwner(
  actor,
  transaction,
  { completing = false } = {},
) {
  if (!actor.isGuest) {
    if (
      !(await User.findByPk(actor.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      }))
    )
      throw studioError("OWNERSHIP_VIOLATION", "Account not found", 404);
    return;
  }
  const guest = await GuestSession.findByPk(actor.id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!guest || guest.status !== "active")
    throw studioError(
      "GUEST_SESSION_UNAVAILABLE",
      "Guest session is no longer active",
      410,
    );
  if (!completing && guest.expiresAt <= new Date())
    throw studioError(
      "GUEST_SESSION_EXPIRED",
      "Guest session has expired",
      410,
    );
  return guest;
}
