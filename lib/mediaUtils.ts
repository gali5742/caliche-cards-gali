import { importApkg } from "./apkg";
import { getApkgFile } from "./apkgStorage";
import { getMediaBlob, saveMediaItems } from "./mediaStorage";
import { soundCandidatesFromFilename } from "./cardUtils";

export const LOCAL_ONLY_MODE = false;

const inFlightCloudMediaFetch = new Map<string, Promise<Blob | null>>();

export async function downloadMediaBlobFromCloud(
  libraryId: string,
  name: string
): Promise<Blob | null> {
  if (LOCAL_ONLY_MODE) return null;
  const safeLibraryId = String(libraryId ?? "").trim();
  const safeName = String(name ?? "").trim();
  if (!safeLibraryId || !safeName) return null;

  const key = `${safeLibraryId}:${safeName}`;
  const existing = inFlightCloudMediaFetch.get(key);
  if (existing) return existing;

  const p = (async () => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 30_000);
    try {
      const url = (base: "/api/sync" | "/api/guest") =>
        `${base}/media/download?libraryId=${encodeURIComponent(
          safeLibraryId
        )}&name=${encodeURIComponent(safeName)}`;

      const res = await fetch(url("/api/sync"), { method: "GET", signal: ctrl.signal });
      if (res.status === 401) {
        const guestRes = await fetch(url("/api/guest"), {
          method: "GET",
          signal: ctrl.signal,
        });
        if (!guestRes.ok) return null;
        const blob = await guestRes.blob();
        if (!blob || blob.size <= 0) return null;
        return blob;
      }

      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || blob.size <= 0) return null;
      return blob;
    } catch {
      return null;
    } finally {
      window.clearTimeout(t);
    }
  })();

  inFlightCloudMediaFetch.set(key, p);
  try {
    return await p;
  } finally {
    inFlightCloudMediaFetch.delete(key);
  }
}

export async function tryPlayAudioFilename(
  namespace: string,
  filename: string
): Promise<void> {
  const ensureMediaFromCloud = async (): Promise<boolean> => {
    const blob = await downloadMediaBlobFromCloud(namespace, filename);
    if (!blob) return false;
    try {
      await saveMediaItems(namespace, [{ name: filename, blob }]);
      return true;
    } catch {
      return false;
    }
  };

  const ensureMediaFromCachedApkg = async (): Promise<boolean> => {
    // Best-effort: if media wasn't stored (quota/bug), attempt to re-extract it
    // from the locally cached .apkg for this library.
    const stored = await getApkgFile(namespace).catch(() => null);
    if (!stored) return false;
    const file = new File([stored.blob], stored.filename || "deck.apkg", {
      type: "application/octet-stream",
    });
    try {
      await importApkg(file, { mediaNamespace: namespace });
      return true;
    } catch {
      return false;
    }
  };

  let blob = await getMediaBlob(namespace, filename);
  if (!blob) {
    const fromCloud = await ensureMediaFromCloud();
    if (fromCloud) blob = await getMediaBlob(namespace, filename);
  }
  if (!blob) {
    const repaired = await ensureMediaFromCachedApkg();
    if (repaired) blob = await getMediaBlob(namespace, filename);
  }
  if (!blob) throw new Error("blob not found");

  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.onerror = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("play failed");
  }
}

// Re-export for consumers that also import sound utilities from here
export { soundCandidatesFromFilename };
