import { ApiError, uploadCopyPhoto } from "./api";

/**
 * Saves the photos chosen while adding a copy. A failure here does not
 * remove the copy. The note says which side failed. Neither photo is
 * treated as proof of anything.
 */
export async function saveCopyPhotos(
  copyId: string,
  photos: { front: File | null; back: File | null },
): Promise<string | null> {
  const missed: string[] = [];
  for (const side of ["front", "back"] as const) {
    const file = photos[side];
    if (!file) continue;
    try {
      await uploadCopyPhoto(copyId, side, file);
    } catch (err) {
      const which = side === "front" ? "The front photo" : "The back photo";
      const detail = err instanceof ApiError ? ` ${err.message}` : "";
      missed.push(`${which} was not saved.${detail}`);
    }
  }
  return missed.length > 0 ? missed.join(" ") : null;
}
