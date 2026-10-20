"use client";
/* eslint-disable @next/next/no-img-element */
// Adapted from What's Good's self-serve library panel; adds owned original downloads and deletion.
import { useEffect, useState } from "react";
import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { downloadOriginal, studioApi, studioError } from "@/lib/studio-api";
import type { PhotoStudioPhoto } from "@/lib/studio-types";
import StudioDialog from "./StudioDialog";

export default function PhotoStudioLibraryPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<PhotoStudioPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    studioApi
      .library()
      .then((data) => {
        if (active) setPhotos(data.photos);
      })
      .catch((err) => {
        if (active) setError(studioError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(photo: PhotoStudioPhoto, remove: boolean) {
    if (
      busy ||
      (remove &&
        !window.confirm("Delete this saved photograph from your library?"))
    )
      return;
    setBusy(photo.id);
    setError("");
    try {
      if (remove) {
        await studioApi.removePhoto(photo.id);
        setPhotos((items) => items.filter((item) => item.id !== photo.id));
      } else
        await downloadOriginal(
          `/api/photoStudio/library/${encodeURIComponent(photo.id)}/download`,
          `fussy-panda-${photo.id}.png`,
        );
    } catch (err) {
      setError(studioError(err));
    } finally {
      setBusy(null);
    }
  }
  return (
    <StudioDialog title="Your photo library" onClose={onClose}>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="animate-spin" size={18} />
          Loading saved photographs…
        </p>
      ) : !photos.length ? (
        <p className="py-10 text-center text-sm text-zinc-600">
          Photographs you save in Photo Studio will appear here.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {photos.map((photo) => (
            <article
              key={photo.id}
              className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
            >
              <img
                src={photo.imageUrl}
                alt="Saved polished dish preview"
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 p-3">
                <button
                  disabled={Boolean(busy)}
                  onClick={() => void action(photo, false)}
                  className="flex min-h-10 items-center gap-2 text-xs font-semibold disabled:opacity-50"
                >
                  <Download size={16} />
                  Download original
                </button>
                <button
                  aria-label="Delete saved photograph"
                  disabled={Boolean(busy)}
                  onClick={() => void action(photo, true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-red-700 disabled:opacity-50"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </StudioDialog>
  );
}
