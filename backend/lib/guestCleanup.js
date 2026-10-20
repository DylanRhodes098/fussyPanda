import { Op } from "sequelize";
import {
  GuestSession,
  PhotoStudioChat as Chat,
  PhotoStudioMessage as Message,
  PhotoStudioGeneration as Generation,
  PhotoStudioEnvironment as Environment,
  PhotoStudioCreditBucket as Bucket,
  PhotoStudioFile as File,
  sequelize,
} from "../models/index.js";
import { releasePhotoStudioCredit } from "./photoStudioCredits.js";
import { removePhotoStudioPaths } from "./photoStudioStorage.js";
export async function cleanupGuestTrials({ now = new Date() } = {}) {
  // Leases are renewed by the worker. Expiry alone cannot remove active provider work.
  const leaseMs = Math.max(
    120_000,
    Number(process.env.GUEST_WORK_LEASE_MS) || 20 * 60_000,
  );
  const stale = new Date(+now - leaseMs);
  const candidates = await GuestSession.findAll({
    where: {
      status: "active",
      [Op.or]: [
        { expiresAt: { [Op.lte]: now } },
        { lastWorkAt: { [Op.lte]: stale } },
      ],
    },
  });
  let expired = 0,
    recovered = 0;
  for (const candidate of candidates) {
    const result = await sequelize
      .transaction(async (transaction) => {
        const guest = await GuestSession.findByPk(candidate.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!guest || guest.status !== "active") return null;
        const actor = { id: guest.id, isGuest: true };
        const where = { guestId: guest.id };
        const reservations = await Bucket.sum("reserved", {
          where,
          transaction,
        });
        const generations = await Generation.findAll({
          where: { ...where, status: "generating" },
          transaction,
        });
        const chats = await Chat.findAll({ where, transaction });
        const messages = chats.length
          ? await Message.findAll({
              where: {
                chatId: { [Op.in]: chats.map((c) => c.id) },
                status: "generating",
              },
              transaction,
            })
          : [];
        const active =
          reservations > 0 || generations.length || messages.length;
        if (active && guest.lastWorkAt && guest.lastWorkAt > stale) return null;
        if (active) {
          for (const record of [...generations, ...messages]) {
            if (record.creditOperationId)
              await releasePhotoStudioCredit({
                userId: null,
                guestId: guest.id,
                operationId: record.creditOperationId,
                transaction,
              });
            await record.update({ status: "failed" }, { transaction });
          }
          // Dangling reservations from a terminated process are also safely released.
          const { PhotoStudioCreditLedgerEntry: Ledger } =
            await import("../models/index.js");
          const pending = await Ledger.findAll({
            where: { guestId: guest.id, type: "reserve" },
            transaction,
          });
          for (const reservation of pending) {
            const terminal = await Ledger.count({
              where: {
                operationId: reservation.operationId,
                type: { [Op.in]: ["consume", "release"] },
              },
              transaction,
            });
            if (!terminal)
              await releasePhotoStudioCredit({
                userId: null,
                guestId: guest.id,
                operationId: reservation.operationId,
                transaction,
              });
          }
        }
        if (guest.expiresAt > now) return active ? "recovered" : null;
        const files = await File.findAll({ where, transaction });
        // Guest row lock serializes cleanup with uploads, claims, and completion. Rows remain on failure for retry.
        await removePhotoStudioPaths({
          account: actor,
          storagePaths: files.map((file) => file.storagePath),
          transaction,
        });
        await Chat.destroy({ where, transaction });
        await Generation.destroy({ where, transaction });
        await Environment.destroy({ where, transaction });
        await Bucket.destroy({ where, transaction });
        await guest.update({ status: "expired" }, { transaction });
        return "expired";
      })
      .catch(() => null);
    if (result === "expired") expired++;
    if (result === "recovered") recovered++;
  }
  // Hashed credential tombstones are intentionally retained; a consumed/claimed cookie never starts another trial.
  return { expired, recovered };
}
