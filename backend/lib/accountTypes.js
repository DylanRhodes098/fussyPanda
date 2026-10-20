export const ACCOUNT_TYPES = Object.freeze({ PHOTO_STUDIO: "photo_studio" });
export function isPhotoStudioAccount(user) {
  return user?.accountType === ACCOUNT_TYPES.PHOTO_STUDIO;
}
