import { getPhotoStudioCreditSummary } from "./photoStudioCredits.js";
export async function canGeneratePhotoStudioImage(userId) {
  return (await getPhotoStudioCreditSummary({ userId })).available > 0;
}
