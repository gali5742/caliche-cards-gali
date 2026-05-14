"use client";

import type { Dispatch, SetStateAction } from "react";

import type { ImportedDeck } from "./apkg";
import { importApkg } from "./apkg";
import { clearLastState, saveLastState, type LibraryItem } from "./deckStorage";
import { clearMedia, getMediaBlob } from "./mediaStorage";
import { clearApkg, saveApkgFile } from "./apkgStorage";
import { deleteStudyDb, getStudyDb } from "./studyDb";
import {
  getDeckConfig,
  getDeckOverview,
  upsertImportedDeck,
  type DeckOverview,
} from "./studyApi";
import { DEFAULT_DECK_CONFIG } from "./scheduler";
import {
  computeReviewLogSyncKey,
  extractDeckMediaCandidates,
  sanitizeWriteLanguage,
} from "./cardUtils";
import { LOCAL_ONLY_MODE } from "./mediaUtils";
import type {
  CardStateEntity,
  DeckConfig,
  DeckRef,
  NextCard,
  ReviewAnswerStyle,
  ReviewLogEntity,
} from "./studyTypes";
import {
  decodeDeckDataBlob,
  encodeDeckDataFile,
  exportDeckDataFromStudyDb,
  fetchWithTimeout,
  isMissingLocalDeckDataError,
  recoverDeckDataFromCachedApkg,
} from "./syncUtils";

type LocalReviewLogRow = Omit<ReviewLogEntity, "syncKey"> & { syncKey?: string };
type ReviewLogPushPayload = Omit<ReviewLogEntity, "id">;
type ProgressPullResponse = {
  ok: boolean;
  cardStates: CardStateEntity[];
  reviewLogs: ReviewLogPushPayload[];
  deckConfigs: Array<{
    libraryId: string;
    deckId: number;
    newPerDay: number;
    reviewsPerDay: number;
    cardInfoOpenByDefault?: boolean;
    writeLanguage?: "en" | "fr" | "es";
    answerStyles?: string[];
    hiddenFieldLabels?: string[];
    pinnedBackFieldLabels?: string[];
    updatedAt: number;
  }>;
};

export function useCloudSync({
  libraries,
  uiLibraries,
  activeLibraryId,
  lastSyncAt,
  lastPushAtLocal,
  authUser,
  devPurgeEnabled,
  reviewRef,
  setError,
  setBusy,
  setSyncBusy,
  setSyncProgress,
  setLastSyncAt,
  setLastPushAtLocal,
  setLibraries,
  setActiveLibraryId,
  setMode,
  setShowAnswer,
  setReviewRef,
  setCurrent,
  setReviewOverview,
  setReviewDeckConfig,
  setDeckOverviews,
}: {
  libraries: LibraryItem[];
  uiLibraries: LibraryItem[];
  activeLibraryId: string | null;
  lastSyncAt: number | null;
  lastPushAtLocal: number | null;
  authUser: { username: string } | null | undefined;
  devPurgeEnabled: boolean;
  reviewRef: DeckRef | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setSyncBusy: Dispatch<SetStateAction<boolean>>;
  setSyncProgress: Dispatch<SetStateAction<{ done: number; total: number; phase: string } | null>>;
  setLastSyncAt: Dispatch<SetStateAction<number | null>>;
  setLastPushAtLocal: Dispatch<SetStateAction<number | null>>;
  setLibraries: Dispatch<SetStateAction<LibraryItem[]>>;
  setActiveLibraryId: Dispatch<SetStateAction<string | null>>;
  setMode: Dispatch<SetStateAction<"import" | "review">>;
  setShowAnswer: Dispatch<SetStateAction<boolean>>;
  setReviewRef: Dispatch<SetStateAction<DeckRef | null>>;
  setCurrent: Dispatch<SetStateAction<NextCard | null>>;
  setReviewOverview: Dispatch<SetStateAction<DeckOverview | null>>;
  setReviewDeckConfig: Dispatch<SetStateAction<DeckConfig | null>>;
  setDeckOverviews: Dispatch<SetStateAction<Record<string, DeckOverview>>>;
}) {
async function uploadLibraryMediaToCloudNow(args: {
  libraryId: string;
  deck: ImportedDeck;
}): Promise<void> {
  const libraryId = String(args.libraryId ?? "").trim();
  if (!libraryId) return;

  const candidates = extractDeckMediaCandidates(args.deck);
  if (candidates.length === 0) return;

  // If we don't have any local blobs at all, skip quickly.
  // (Common on a fresh device that only downloaded deck data.)
  {
    const sample = candidates.slice(0, 25);
    let hasAnyLocal = false;
    for (const name of sample) {
      if (!name) continue;
      const blob = await getMediaBlob(libraryId, name);
      if (blob && blob.size > 0) {
        hasAnyLocal = true;
        break;
      }
    }
    if (!hasAnyLocal) return;
  }

  // Best-effort: if user isn't logged in, just skip.
  const listRes = await fetchWithTimeout(
    `/api/sync/media/list?libraryId=${encodeURIComponent(libraryId)}`,
    { cache: "no-store" },
    30_000,
    "Media list"
  );

  if (listRes.status === 401) return;
  if (!listRes.ok) return;

  const listData: unknown = await listRes.json().catch(() => null);
  const cloudNames = (() => {
    if (!listData || typeof listData !== "object") return new Set<string>();
    if (!("items" in listData)) return new Set<string>();
    const raw = (listData as { items?: unknown }).items;
    if (!Array.isArray(raw)) return new Set<string>();
    const names = raw
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const name = (x as { name?: unknown }).name;
        return typeof name === "string" ? name : null;
      })
      .filter((x): x is string => Boolean(x));
    return new Set(names);
  })();

  const toUpload: Array<{ name: string; blob: Blob }> = [];
  for (const name of candidates) {
    if (!name) continue;
    if (cloudNames.has(name)) continue;
    const blob = await getMediaBlob(libraryId, name);
    if (!blob) continue;
    if (blob.size <= 0) continue;
    toUpload.push({ name, blob });
  }

  if (toUpload.length === 0) return;

  // Keep batches small to reduce timeouts on slower connections.
  const MAX_FILES_PER_REQ = 6;
  const MAX_BYTES_PER_REQ = 6 * 1024 * 1024;

  let batch: Array<{ name: string; blob: Blob }> = [];
  let batchBytes = 0;

  const flush = async (): Promise<boolean> => {
    if (batch.length === 0) return true;

    const form = new FormData();
    form.set("libraryId", libraryId);
    for (const it of batch) {
      const type = String(it.blob.type || "application/octet-stream");
      form.append("file", new File([it.blob], it.name, { type }));
    }

    const res = await fetchWithTimeout(
      "/api/sync/media/upload",
      { method: "POST", body: form },
      180_000,
      "Media upload"
    );

    // If unauthenticated/offline/server error, stop silently.
    if (res.status === 401) return false;
    if (!res.ok) return false;
    batch = [];
    batchBytes = 0;
    return true;
  };

  for (const it of toUpload) {
    const size = Number(it.blob.size || 0);
    const wouldOverflowFiles = batch.length >= MAX_FILES_PER_REQ;
    const wouldOverflowBytes = batchBytes > 0 && batchBytes + size > MAX_BYTES_PER_REQ;

    if (wouldOverflowFiles || wouldOverflowBytes) {
      const ok = await flush();
      if (ok === false) return;
    }

    batch.push(it);
    batchBytes += size;

    if (batch.length >= MAX_FILES_PER_REQ || batchBytes >= MAX_BYTES_PER_REQ) {
      const ok = await flush();
      if (ok === false) return;
    }
  }

  await flush();
}

async function uploadDeckDataFileToCloud(args: {
  libraryId: string;
  name: string;
  file: File;
  _attempt?: number;
}): Promise<void> {
  const form = new FormData();
  form.set("libraryId", args.libraryId);
  form.set("name", args.name);
  form.set("file", args.file);

  const res = await fetchWithTimeout(
    "/api/sync/upload-deck",
    {
      method: "POST",
      body: form,
    },
    120_000,
    "Upload"
  );

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const jsonMsg = (() => {
      if (!data || typeof data !== "object") return null;
      if (!("error" in data)) return null;
      const err = (data as { error?: unknown }).error;
      return typeof err === "string" ? err : null;
    })();

    if (jsonMsg) {
      const attempt = args._attempt ?? 0;
      const isQuota = /space quota|over your space quota|quota/i.test(jsonMsg);
      if (isQuota && attempt < 1) {
        try {
          await fetch("/api/sync/cleanup", { method: "POST" });
        } catch {
          // ignore
        }
        await uploadDeckDataFileToCloud({ ...args, _attempt: attempt + 1 });
        return;
      }

      throw new Error(jsonMsg);
    }

    const text = await res.text().catch(() => "");
    const trimmed = text.trim();
    const maybeHtml = /^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed);
    const fallbackDetail = !maybeHtml && trimmed ? trimmed.slice(0, 200) : "";

    throw new Error(
      `Failed to sync to cloud (HTTP ${res.status})${fallbackDetail ? `: ${fallbackDetail}` : ""}`
    );
  }
}

async function uploadDeckDataToCloud(args: {
  libraryId: string;
  name: string;
  deck: ImportedDeck;
  _attempt?: number;
}): Promise<void> {
  const file = await encodeDeckDataFile(args.deck);

  await uploadDeckDataFileToCloud({
    libraryId: args.libraryId,
    name: args.name,
    file,
    _attempt: args._attempt,
  });
}

async function uploadLibraryDeckDataToCloudNow(args: {
  libraryId: string;
  libraryName: string;
}): Promise<void> {
  let deck: ImportedDeck | null = null;
  try {
    deck = await exportDeckDataFromStudyDb(args.libraryId);
  } catch (e: unknown) {
    if (isMissingLocalDeckDataError(e)) {
      deck = await recoverDeckDataFromCachedApkg(args.libraryId);
    } else {
      throw e;
    }
  }

  if (!deck) {
    throw new Error(
      "This deck isn't available locally yet. Re-import the .apkg to restore it."
    );
  }

  const file = await encodeDeckDataFile(deck);
  const res = await fetchWithTimeout(
    "/api/sync/upload-deck",
    (() => {
      const form = new FormData();
      form.set("libraryId", args.libraryId);
      form.set("name", args.libraryName);
      form.set("file", file);
      return { method: "POST", body: form };
    })(),
    120_000,
    "Upload"
  );

  if (res.status === 401) return;
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const jsonMsg = (() => {
      if (!data || typeof data !== "object") return null;
      if (!("error" in data)) return null;
      const err = (data as { error?: unknown }).error;
      return typeof err === "string" ? err : null;
    })();
    throw new Error(jsonMsg ?? "Failed to upload deck data");
  }
}

async function deleteLibraryFromCloudNow(libraryId: string): Promise<void> {
  const res = await fetchWithTimeout(
    "/api/sync/delete-library",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ libraryId }),
    },
    30_000,
    "Cloud delete"
  );

  if (res.status === 401) return;
  if (!res.ok) {
    const errData: unknown = await res.json().catch(() => null);
    const msg = (() => {
      if (!errData || typeof errData !== "object") return null;
      if (!("error" in errData)) return null;
      const err = (errData as { error?: unknown }).error;
      return typeof err === "string" ? err : null;
    })();
    throw new Error(msg ?? "Cloud delete failed");
  }
}

async function importApkgAsLibrary(args: {
  libraryId: string;
  libraryName: string;
  file: File;
}): Promise<{ item: LibraryItem; imported: ImportedDeck }> {
  const { libraryId: id, libraryName: name, file } = args;

  const baseName = file.name.replace(/\.[^.]+$/u, "").trim();
  const imported = await importApkg(file, { mediaNamespace: id });

  // Cache the original .apkg locally so we can recover/re-upload later if the
  // study IndexedDB is cleared or partially missing.
  try {
    await saveApkgFile({ libraryId: id, file });
  } catch {
    // ignore (quota / private mode)
  }

  // If the export contains exactly one top-level deck, rename it to the
  // filename (sans extension) so the list matches what you imported.
  const topLevelDecks = imported.decks.filter((d) => !d.name.includes("::"));
  const shouldRenameTopLevel = baseName && topLevelDecks.length === 1;
  const importedWithRenamedTopLevel: ImportedDeck = shouldRenameTopLevel
    ? {
        ...imported,
        decks: imported.decks.map((d) =>
          d.id === topLevelDecks[0]?.id ? { ...d, name: baseName } : d
        ),
      }
    : imported;

  const defaultDeckId = importedWithRenamedTopLevel.decks[0]?.id ?? null;

  const nextItem: LibraryItem = {
    id,
    name,
    deck: {
      decks: importedWithRenamedTopLevel.decks.map((d) => ({ id: d.id, name: d.name })),
    },
    selectedDeckId: defaultDeckId,
    savedAt: Date.now(),
  };

  await upsertImportedDeck(id, importedWithRenamedTopLevel);
  return { item: nextItem, imported: importedWithRenamedTopLevel };
}

async function importDeckDataAsLibrary(args: {
  libraryId: string;
  libraryName: string;
  deck: ImportedDeck;
}): Promise<LibraryItem> {
  const { libraryId: id, libraryName: name, deck } = args;

  const defaultDeckId = deck.decks[0]?.id ?? null;
  const nextItem: LibraryItem = {
    id,
    name,
    deck: {
      decks: deck.decks.map((d) => ({ id: d.id, name: d.name })),
    },
    selectedDeckId: defaultDeckId,
    savedAt: Date.now(),
  };

  await upsertImportedDeck(id, deck);
  return nextItem;
}

async function onClearSaved() {
  await clearLastState();
  await clearMedia();
  await clearApkg();
  await deleteStudyDb();
  setLibraries([]);
  setActiveLibraryId(null);
  setLastSyncAt(null);
  setLastPushAtLocal(null);
  setMode("import");
  setShowAnswer(false);
  setReviewRef(null);
  setCurrent(null);
  setReviewOverview(null);
  setDeckOverviews({});
}

async function onLogout() {
  const ok = confirm("Are you sure you want to log out?");
  if (!ok) return;
  try {
    try {
      await onClearSaved();
    } catch {
      // ignore
    }

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
  } finally {
    window.location.href = "/login";
  }
}

async function onDevPurgeOtherUsers() {
  if (!devPurgeEnabled) return;
  if (!authUser) return;

  const typed = window.prompt(
    "DEV ONLY. This will delete all cloud data for OTHER userIds (and then delete unreferenced media files).\n\nType PURGE_OTHER_USERS to confirm."
  );
  if (typed !== "PURGE_OTHER_USERS") return;

  setError(null);
  setBusy(true);
  try {
    const res = await fetch("/api/admin/purge-other-users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "PURGE_OTHER_USERS" }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error ?? "Purge failed")
          : "Purge failed";
      throw new Error(msg);
    }

    const deleted =
      data && typeof data === "object" && "deletedGridFsFiles" in data
        ? (data as { deletedGridFsFiles?: unknown }).deletedGridFsFiles
        : null;

    window.alert(
      `Purge complete.\n\nGridFS deleted:\n${JSON.stringify(deleted, null, 2)}`
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Purge failed";
    setError(msg);
  } finally {
    setBusy(false);
  }
}

async function onDevResetMyCloud() {
  if (!devPurgeEnabled) return;
  if (!authUser) return;

  const typed = window.prompt(
    "DEV ONLY. This will DELETE ALL your cloud data (libraries, progress, and media) for your current user.\n\nYour local data stays. After this, click Sync to re-upload from this device.\n\nType RESET_MY_CLOUD to confirm."
  );
  if (typed !== "RESET_MY_CLOUD") return;

  setError(null);
  setBusy(true);
  try {
    const res = await fetch("/api/admin/reset-my-cloud", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "RESET_MY_CLOUD" }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error ?? "Reset failed")
          : "Reset failed";
      throw new Error(msg);
    }

    const deleted =
      data && typeof data === "object" && "deletedGridFsFiles" in data
        ? (data as { deletedGridFsFiles?: unknown }).deletedGridFsFiles
        : null;

    window.alert(
      `Cloud reset complete.\n\nGridFS deleted:\n${JSON.stringify(deleted, null, 2)}\n\nNow click Sync to re-upload from this device.`
    );

    // IMPORTANT: after cloud reset, force a full progress push next sync.
    // Otherwise, lastSyncAt might cause the client to skip uploading older local progress.
    setLastSyncAt(null);
    setLastPushAtLocal(null);
    void saveLastState({
      libraries,
      activeLibraryId,
      savedAt: Date.now(),
      lastSyncAt: null,
      lastPushAtLocal: null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Reset failed";
    setError(msg);
  } finally {
    setBusy(false);
  }
}

async function onDevDebugLocalProgress() {
  if (!devPurgeEnabled) return;

  try {
    const db = getStudyDb();
    const MAX_TS = Number.MAX_SAFE_INTEGER;

    const rows: Array<{
      libraryId: string;
      name: string;
      cardStatesTotal: number;
      cardStatesUpdated: number;
      reviewLogsTotal: number;
      decksTotal: number;
    }> = [];

    for (const lib of uiLibraries) {
      const cardStatesTotal = await db.cardStates.where("libraryId").equals(lib.id).count();
      const cardStatesUpdated = await db.cardStates
        .where("[libraryId+updatedAt]")
        .between([lib.id, 1], [lib.id, MAX_TS], true, true)
        .count();
      const reviewLogsTotal = await db.reviewLogs.where("libraryId").equals(lib.id).count();
      const decksTotal = await db.decks.where("libraryId").equals(lib.id).count();

      rows.push({
        libraryId: lib.id,
        name: lib.name,
        cardStatesTotal,
        cardStatesUpdated,
        reviewLogsTotal,
        decksTotal,
      });
    }

    window.alert(`Local progress snapshot:\n\n${JSON.stringify(rows, null, 2)}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Debug failed";
    setError(msg);
  }
}

async function onDevDebugCloudProgress() {
  if (!devPurgeEnabled) return;
  if (!authUser) return;

  try {
    const res = await fetch("/api/admin/debug-my-cloud-progress", { cache: "no-store" });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error ?? "Debug failed")
          : "Debug failed";
      throw new Error(msg);
    }

    window.alert(`Cloud progress snapshot:\n\n${JSON.stringify(data, null, 2)}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Debug failed";
    setError(msg);
  }
}

async function onPickFile(file: File) {
  setError(null);
  setBusy(true);
  try {
    const id = crypto.randomUUID();
    const baseName = file.name.replace(/\.[^.]+$/u, "").trim();
    const name = baseName || "Deck";

    const { item: nextItem } = await importApkgAsLibrary({
      libraryId: id,
      libraryName: name,
      file,
    });

    setLibraries((prev) => {
      const next = [...prev, nextItem];
      void saveLastState({
        libraries: next,
        activeLibraryId: id,
        savedAt: Date.now(),
      });
      return next;
    });

    setActiveLibraryId(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error importing .apkg";
    setError(msg);
  } finally {
    setBusy(false);
  }
}

async function onLoadDemoDecks() {
  if (LOCAL_ONLY_MODE) return;
  setError(null);
  setSyncBusy(true);
  setSyncProgress({ done: 0, total: 1, phase: "Listing demo decks…" });
  try {
    const res = await fetchWithTimeout(
      "/api/guest/list",
      { cache: "no-store" },
      30_000,
      "Guest list"
    );

    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (() => {
        if (!data || typeof data !== "object") return null;
        if (!("error" in data)) return null;
        const err = (data as { error?: unknown }).error;
        return typeof err === "string" ? err : null;
      })();
      throw new Error(msg ?? "Failed to list demo decks");
    }

    const libs = (() => {
      if (!data || typeof data !== "object") return [];
      if (!("libraries" in data)) return [];
      const raw = (data as { libraries?: unknown }).libraries;
      if (!Array.isArray(raw)) return [];
      return raw
        .map((x) => {
          if (!x || typeof x !== "object") return null;
          const libraryId = (x as { libraryId?: unknown }).libraryId;
          const name = (x as { name?: unknown }).name;
          const originalFilename = (x as { originalFilename?: unknown }).originalFilename;
          if (typeof libraryId !== "string" || typeof name !== "string") return null;
          return {
            libraryId,
            name,
            originalFilename:
              typeof originalFilename === "string" ? originalFilename : "deck.apkg",
          };
        })
        .filter(
          (x): x is { libraryId: string; name: string; originalFilename: string } =>
            Boolean(x)
        );
    })();

    if (libs.length === 0) {
      setSyncProgress({ done: 1, total: 1, phase: "No demo decks found." });
      return;
    }

    const localById = new Map(libraries.map((l) => [l.id, l] as const));
    const toDownload = libs.filter((l) => !localById.has(l.libraryId));

    const totalSteps = 1 + Math.max(1, toDownload.length) * 2;
    setSyncProgress({ done: 1, total: totalSteps, phase: "Loading demo decks…" });

    const advance = (phase: string) => {
      setSyncProgress((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          done: Math.min(prev.total, prev.done + 1),
          phase,
        };
      });
    };

    const importedItems: LibraryItem[] = [];
    for (const lib of toDownload) {
      advance(`Downloading “${lib.name}”…`);
      const dl = await fetchWithTimeout(
        `/api/guest/download-deck?libraryId=${encodeURIComponent(lib.libraryId)}`,
        { cache: "no-store" },
        120_000,
        "Guest download"
      );

      if (!dl.ok) {
        const errData: unknown = await dl.json().catch(() => null);
        const msg = (() => {
          if (!errData || typeof errData !== "object") return null;
          if (!("error" in errData)) return null;
          const err = (errData as { error?: unknown }).error;
          return typeof err === "string" ? err : null;
        })();
        throw new Error(msg ?? `Failed to download “${lib.name}”`);
      }

      const blob = await dl.blob();
      const deck = await decodeDeckDataBlob(blob);
      advance(`Importing “${lib.name}”…`);
      const item = await importDeckDataAsLibrary({
        libraryId: lib.libraryId,
        libraryName: lib.name,
        deck,
      });
      importedItems.push({ ...item, source: "guest" } as LibraryItem);
    }

    if (importedItems.length > 0) {
      setLibraries((prev) => {
        const next = [...prev, ...importedItems];
        void saveLastState({
          libraries: next,
          activeLibraryId: activeLibraryId ?? importedItems[0]?.id ?? null,
          savedAt: Date.now(),
          lastSyncAt,
        });
        return next;
      });
      if (!activeLibraryId) {
        setActiveLibraryId(importedItems[0]?.id ?? null);
      }
    }

    setSyncProgress({
      done: totalSteps,
      total: totalSteps,
      phase: "Demo decks loaded.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load demo decks";
    setError(msg);
  } finally {
    setSyncBusy(false);
    window.setTimeout(() => setSyncProgress(null), 1_500);
  }
}

async function onSyncFromCloud(opts?: { silent?: boolean }) {
  if (LOCAL_ONLY_MODE) {
    if (!opts?.silent) setError("Cloud sync is disabled. This app now runs local-only.");
    return;
  }
  const silent = Boolean(opts?.silent);
  const reportError = (msg: string) => {
    if (!silent) setError(msg);
  };

  if (!silent) setError(null);
  setSyncBusy(true);
  setSyncProgress({ done: 0, total: 1, phase: "Listing cloud decks…" });
  try {
    const res = await fetchWithTimeout(
      "/api/sync/list",
      { cache: "no-store" },
      30_000,
      "Cloud list"
    );
    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = (() => {
        if (!data || typeof data !== "object") return null;
        if (!("error" in data)) return null;
        const err = (data as { error?: unknown }).error;
        return typeof err === "string" ? err : null;
      })();
      throw new Error(msg ?? "Failed to list cloud decks");
    }

    const libs = (() => {
      if (!data || typeof data !== "object") return [];
      if (!("libraries" in data)) return [];
      const raw = (data as { libraries?: unknown }).libraries;
      if (!Array.isArray(raw)) return [];
      return raw
        .map((x) => {
          if (!x || typeof x !== "object") return null;
          const libraryId = (x as { libraryId?: unknown }).libraryId;
          const name = (x as { name?: unknown }).name;
          const originalFilename = (x as { originalFilename?: unknown }).originalFilename;
          if (typeof libraryId !== "string" || typeof name !== "string") return null;
          return {
            libraryId,
            name,
            originalFilename: typeof originalFilename === "string" ? originalFilename : "deck.apkg",
          };
        })
        .filter((x): x is { libraryId: string; name: string; originalFilename: string } => Boolean(x));
    })();

    const cloudById = new Map(libs.map((l) => [l.libraryId, l] as const));
    const localById = new Map(libraries.map((l) => [l.id, l] as const));

    const toUpload = libraries.filter((l) => !cloudById.has(l.id));
    const toDownload = libs.filter((l) => !localById.has(l.libraryId));

    const plannedMergedCount = libraries.length + toDownload.length;
    const uploadSteps = toUpload.length * 3;
    const totalSteps =
      1 + uploadSteps + toDownload.length + plannedMergedCount * 2 + 1;

    setSyncProgress({
      done: 1,
      total: Math.max(1, totalSteps),
      phase: "Syncing decks…",
    });

    const advance = (phase: string) => {
      setSyncProgress((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          done: Math.min(prev.total, prev.done + 1),
          phase,
        };
      });
    };

    const setPhase = (phase: string) => {
      setSyncProgress((prev) => (prev ? { ...prev, phase } : prev));
    };

    // Upload locals missing in cloud.
    const uploadWarnings: string[] = [];
    for (const local of toUpload) {
      setPhase(`Exporting “${local.name}”…`);

      let deck: ImportedDeck | null = null;
      try {
        deck = await exportDeckDataFromStudyDb(local.id);
      } catch (e: unknown) {
        if (isMissingLocalDeckDataError(e)) {
          setPhase(`Recovering “${local.name}” from cached .apkg…`);
          deck = await recoverDeckDataFromCachedApkg(local.id);
          if (!deck) {
            uploadWarnings.push(
              `“${local.name}” couldn't upload because the deck data isn't stored locally on this device. Re-import the .apkg to restore it.`
            );
          }
        } else {
          throw e;
        }
      }

      if (!deck) {
        // Keep progress consistent with the planned 3 steps for upload.
        advance(`Skipped “${local.name}” export.`);
        advance(`Skipped “${local.name}” encoding.`);
        advance(`Skipped “${local.name}” upload.`);
        continue;
      }

      advance(`Exported “${local.name}”.`);

      setPhase(`Encoding “${local.name}”…`);
      const file = await encodeDeckDataFile(deck);
      advance(`Encoded “${local.name}”.`);

      setPhase(`Uploading “${local.name}”…`);
      await uploadDeckDataFileToCloud({ libraryId: local.id, name: local.name, file });
      advance(`Uploaded “${local.name}”.`);

      // Best-effort: upload media in background (deduped by cloud list).
      void (async () => {
        try {
          await uploadLibraryMediaToCloudNow({ libraryId: local.id, deck });
        } catch {
          // ignore
        }
      })();
    }

    // Best-effort: also retry uploading referenced media for existing local decks.
    // This helps recover from prior partial media uploads (e.g. audio uploaded but
    // images didn't) without requiring a re-import.
    void (async () => {
      if (!authUser) return;
      for (const lib of libraries) {
        try {
          let deck: ImportedDeck | null = null;
          try {
            deck = await exportDeckDataFromStudyDb(lib.id);
          } catch (e: unknown) {
            if (isMissingLocalDeckDataError(e)) {
              deck = await recoverDeckDataFromCachedApkg(lib.id);
            } else {
              throw e;
            }
          }

          if (!deck) continue;
          await uploadLibraryMediaToCloudNow({ libraryId: lib.id, deck });
        } catch {
          // ignore
        }
      }
    })();

    // Download clouds missing locally.
    const importedItems: LibraryItem[] = [];
    for (const lib of toDownload) {
      setPhase(`Downloading “${lib.name}”…`);
      // Prefer the extracted "deck data" format (smaller than uploading full .apkg).
      const dlDeck = await fetchWithTimeout(
        `/api/sync/download-deck?libraryId=${encodeURIComponent(lib.libraryId)}`,
        { cache: "no-store" },
        120_000,
        "Deck download"
      );

      let shouldFallbackToApkg = false;

      if (dlDeck.ok) {
        const blob = await dlDeck.blob();
        const deck = await decodeDeckDataBlob(blob);

        // Back-compat guard: if the cloud deck-data is an older/partial format
        // (missing fields arrays), fall back to downloading the full .apkg.
        const sample = (deck.cards ?? []).slice(0, 25);
        const hasLegacyShape = sample.some((c) => {
          const anyCard = c as unknown as {
            fieldsHtml?: unknown;
            fieldNames?: unknown;
          };
          return !Array.isArray(anyCard.fieldsHtml) || !Array.isArray(anyCard.fieldNames);
        });

        if (!hasLegacyShape) {
          const item = await importDeckDataAsLibrary({
            libraryId: lib.libraryId,
            libraryName: lib.name,
            deck,
          });
          importedItems.push(item);
          advance(`Downloaded “${lib.name}”.`);
          continue;
        }

        shouldFallbackToApkg = true;
      } else {
        // Back-compat: older cloud entries store only the .apkg.
        if (dlDeck.status !== 404) {
          const errData: unknown = await dlDeck.json().catch(() => null);
          const msg = (() => {
            if (!errData || typeof errData !== "object") return null;
            if (!("error" in errData)) return null;
            const err = (errData as { error?: unknown }).error;
            return typeof err === "string" ? err : null;
          })();
          throw new Error(msg ?? "Failed to download deck");
        }
      }

      if (shouldFallbackToApkg === false && dlDeck.status === 404) {
        // Continue to .apkg fallback below.
      }

      const dlApkg = await fetchWithTimeout(
        `/api/sync/download?libraryId=${encodeURIComponent(lib.libraryId)}`,
        { cache: "no-store" },
        180_000,
        "APKG download"
      );
      if (!dlApkg.ok) {
        const errData: unknown = await dlApkg.json().catch(() => null);
        const msg = (() => {
          if (!errData || typeof errData !== "object") return null;
          if (!("error" in errData)) return null;
          const err = (errData as { error?: unknown }).error;
          return typeof err === "string" ? err : null;
        })();
        throw new Error(msg ?? "Failed to download deck");
      }

      const blob = await dlApkg.blob();
      const file = new File([blob], lib.originalFilename, {
        type: "application/octet-stream",
      });

      const { item, imported } = await importApkgAsLibrary({
        libraryId: lib.libraryId,
        libraryName: lib.name,
        file,
      });
      importedItems.push(item);

      // Best-effort: migrate this cloud deck to the smaller deck-data format.
      void (async () => {
        try {
          await uploadDeckDataToCloud({ libraryId: lib.libraryId, name: lib.name, deck: imported });
        } catch {
          // ignore
        }
      })();

      advance(`Downloaded “${lib.name}”.`);
    }

    const mergedLibraries = [...libraries, ...importedItems];
    setLibraries(mergedLibraries);

    if (!activeLibraryId && mergedLibraries.length > 0) {
      setActiveLibraryId(mergedLibraries[0]?.id ?? null);
    }

    // Sync study progress (card states + review logs) bidirectionally.
    // Use cloud time (uploadedAt/serverTime) for incremental pulls.
    // Subtract 1ms to avoid missing entries exactly on the boundary.
    // Use server time for pull (cloud writes use uploadedAt/serverTime).
    const sincePull = Math.max(0, (lastSyncAt ?? 0) - 1);
    let maxServerTime = sincePull;

    // Use local time for push (local writes use Date.now()) to avoid clock-skew.
    const sincePush = Math.max(0, (lastPushAtLocal ?? 0) - 1);
    const db = getStudyDb();
    const MAX_TS = Number.MAX_SAFE_INTEGER;

    for (const lib of mergedLibraries) {
      setPhase(`Preparing progress for “${lib.name}”…`);
      // Pull deckIds from local metadata for efficient IndexedDB queries.
      // If the in-memory deck isn't present, fall back to IndexedDB.
      const deckIdsFromLib = lib.deck?.decks?.map((d) => d.id) ?? [];
      const deckIds =
        deckIdsFromLib.length > 0
          ? deckIdsFromLib
          : (await db.decks.where("libraryId").equals(lib.id).toArray()).map((d) => d.deckId);

      // Backfill missing timestamps for older local rows.
      // If `updatedAt` is missing, IndexedDB compound-index queries won't return the row,
      // causing an empty push even though local progress exists.
      if (sincePush === 0) {
        await db.transaction("rw", db.decks, db.cardStates, async () => {
          await db.decks
            .where("libraryId")
            .equals(lib.id)
            .modify((d) => {
              const row = d as unknown as { updatedAt?: unknown; createdAt?: unknown };
              if (typeof row.updatedAt !== "number" || !Number.isFinite(row.updatedAt)) {
                (d as unknown as { updatedAt: number }).updatedAt = 0;
              }
              if (typeof row.createdAt !== "number" || !Number.isFinite(row.createdAt)) {
                (d as unknown as { createdAt: number }).createdAt = 0;
              }
            });

          await db.cardStates
            .where("libraryId")
            .equals(lib.id)
            .modify((s) => {
              const row = s as unknown as { updatedAt?: unknown; createdAt?: unknown };
              if (typeof row.updatedAt !== "number" || !Number.isFinite(row.updatedAt)) {
                (s as unknown as { updatedAt: number }).updatedAt = 0;
              }
              if (typeof row.createdAt !== "number" || !Number.isFinite(row.createdAt)) {
                (s as unknown as { createdAt: number }).createdAt = 0;
              }
            });
        });
      }

      const deckConfigs = await db.decks
        .where("[libraryId+updatedAt]")
        .between([lib.id, sincePush], [lib.id, MAX_TS], true, true)
        .toArray();

      const cardStates = await db.cardStates
        .where("[libraryId+updatedAt]")
        .between([lib.id, sincePush], [lib.id, MAX_TS], true, true)
        .toArray();

      // Never upload seeded states (updatedAt=0). Those are not real progress and
      // can cause duplicate-key write errors on new devices (cloud already has rows).
      const cardStatesForPush = cardStates.filter(
        (s) => typeof (s as { updatedAt?: unknown }).updatedAt === "number" && (s as { updatedAt: number }).updatedAt > 0
      );

      const reviewLogs: LocalReviewLogRow[] = [];
      for (const deckId of deckIds) {
        const batch = await db.reviewLogs
          .where("[libraryId+deckId+ts]")
          .between([lib.id, deckId, sincePush], [lib.id, deckId, MAX_TS], true, true)
          .toArray();
        reviewLogs.push(...(batch as unknown as LocalReviewLogRow[]));
      }

      // Best-effort: backfill missing syncKey for older local logs.
      const logsWithSyncKey = reviewLogs.map((l) => {
        const hadSyncKey = typeof l.syncKey === "string" && l.syncKey;
        const syncKey = hadSyncKey
          ? l.syncKey
          : computeReviewLogSyncKey({
                libraryId: l.libraryId,
                deckId: l.deckId,
                cardId: l.cardId,
                noteId: l.noteId,
                ts: l.ts,
                result: l.result,
                timeTakenMs: l.timeTakenMs,
                prevState: l.prevState,
                nextState: l.nextState,
                prevDue: l.prevDue,
                nextDue: l.nextDue,
                prevIntervalDays: l.prevIntervalDays,
                nextIntervalDays: l.nextIntervalDays,
                prevStepIndex: l.prevStepIndex,
                nextStepIndex: l.nextStepIndex,
                prevReps: l.prevReps,
                nextReps: l.nextReps,
                prevLapses: l.prevLapses,
                nextLapses: l.nextLapses,
              });
        return { ...l, syncKey, hadSyncKey } as LocalReviewLogRow & { syncKey: string; hadSyncKey: boolean };
      });

      const reviewLogsForPush: ReviewLogPushPayload[] = logsWithSyncKey.map((l) => ({
        syncKey: l.syncKey,
        libraryId: l.libraryId,
        deckId: l.deckId,
        cardId: l.cardId,
        noteId: l.noteId,
        ts: l.ts,
        result: l.result,
        timeTakenMs: l.timeTakenMs,
        prevState: l.prevState,
        nextState: l.nextState,
        prevDue: l.prevDue,
        nextDue: l.nextDue,
        prevIntervalDays: l.prevIntervalDays,
        nextIntervalDays: l.nextIntervalDays,
        prevStepIndex: l.prevStepIndex,
        nextStepIndex: l.nextStepIndex,
        prevReps: l.prevReps,
        nextReps: l.nextReps,
        prevLapses: l.prevLapses,
        nextLapses: l.nextLapses,
      }));

      // Persist backfilled keys so future sync is fast/dedupable.
      await db.transaction("rw", db.reviewLogs, async () => {
        const toUpdate = logsWithSyncKey
          .filter((l) => !l.hadSyncKey)
          .filter((l) => typeof l.id === "number" && l.id > 0);
        if (toUpdate.length === 0) return;
        await Promise.all(
          toUpdate.map((l) => db.reviewLogs.update(l.id as number, { syncKey: l.syncKey }))
        );
      });

      // Push local changes to cloud.
      setPhase(`Pushing progress for “${lib.name}”…`);
      const pushRes = await fetchWithTimeout(
        "/api/sync/progress/push",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            libraryId: lib.id,
            cardStates: cardStatesForPush,
            reviewLogs: reviewLogsForPush,
            deckConfigs: deckConfigs
              .filter((d) => typeof (d as { updatedAt?: unknown }).updatedAt === "number" && (d as { updatedAt: number }).updatedAt > 0)
              .map((d) => ({
              libraryId: d.libraryId,
              deckId: d.deckId,
              newPerDay: d.newPerDay,
              reviewsPerDay: d.reviewsPerDay,
              cardInfoOpenByDefault: Boolean((d as { cardInfoOpenByDefault?: unknown }).cardInfoOpenByDefault),
              writeLanguage: sanitizeWriteLanguage((d as { writeLanguage?: unknown }).writeLanguage),
              answerStyles: Array.isArray((d as { answerStyles?: unknown }).answerStyles)
                ? (d as { answerStyles: string[] }).answerStyles
                : DEFAULT_DECK_CONFIG.answerStyles,
              hiddenFieldLabels: Array.isArray((d as { hiddenFieldLabels?: unknown }).hiddenFieldLabels)
                ? (d as { hiddenFieldLabels: string[] }).hiddenFieldLabels
                : [],
              pinnedBackFieldLabels: Array.isArray((d as { pinnedBackFieldLabels?: unknown }).pinnedBackFieldLabels)
                ? (d as { pinnedBackFieldLabels: string[] }).pinnedBackFieldLabels
                : [],
              updatedAt: d.updatedAt,
            })),
          }),
        },
        120_000,
        "Progress push"
      );

      if (!pushRes.ok) {
        const errData: unknown = await pushRes.json().catch(() => null);
        const msg = (() => {
          if (!errData || typeof errData !== "object") return null;
          if (!("error" in errData)) return null;
          const err = (errData as { error?: unknown }).error;
          return typeof err === "string" ? err : null;
        })();
        throw new Error(msg ?? "Failed to sync progress to cloud");
      }

      if (devPurgeEnabled) {
        const pushData: unknown = await pushRes.json().catch(() => null);
        const received = (() => {
          if (!pushData || typeof pushData !== "object") return null;
          const raw = (pushData as { received?: unknown }).received;
          if (!raw || typeof raw !== "object") return null;
          const cs = (raw as { cardStates?: unknown }).cardStates;
          const rl = (raw as { reviewLogs?: unknown }).reviewLogs;
          return {
            cardStates: typeof cs === "number" ? cs : Number(cs),
            reviewLogs: typeof rl === "number" ? rl : Number(rl),
          };
        })();

        if (received && Number.isFinite(received.cardStates) && Number.isFinite(received.reviewLogs)) {
          advance(
            `Pushed progress for “${lib.name}”. (server received: ${received.cardStates} states, ${received.reviewLogs} logs)`
          );
        } else {
          advance(`Pushed progress for “${lib.name}”.`);
        }
      } else {
        advance(`Pushed progress for “${lib.name}”.`);
      }

      // Pull remote changes since last sync.
      setPhase(`Pulling progress for “${lib.name}”…`);
      const pullRes = await fetchWithTimeout(
        `/api/sync/progress/pull?libraryId=${encodeURIComponent(lib.id)}&since=${encodeURIComponent(
          String(sincePull)
        )}`,
        { cache: "no-store" },
        120_000,
        "Progress pull"
      );

      if (!pullRes.ok) {
        const errData: unknown = await pullRes.json().catch(() => null);
        const msg = (() => {
          if (!errData || typeof errData !== "object") return null;
          if (!("error" in errData)) return null;
          const err = (errData as { error?: unknown }).error;
          return typeof err === "string" ? err : null;
        })();
        throw new Error(msg ?? "Failed to sync progress from cloud");
      }

      const pullData: unknown = await pullRes.json().catch(() => null);

      const serverTime = (() => {
        if (!pullData || typeof pullData !== "object") return null;
        const raw = (pullData as { serverTime?: unknown }).serverTime;
        const n = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
      })();
      if (serverTime != null) maxServerTime = Math.max(maxServerTime, serverTime);

      const remoteCardStates: CardStateEntity[] = (() => {
        if (!pullData || typeof pullData !== "object") return [];
        const raw = (pullData as Partial<ProgressPullResponse>).cardStates;
        return Array.isArray(raw) ? (raw as CardStateEntity[]) : [];
      })();
      const remoteReviewLogs: ReviewLogPushPayload[] = (() => {
        if (!pullData || typeof pullData !== "object") return [];
        const raw = (pullData as Partial<ProgressPullResponse>).reviewLogs;
        return Array.isArray(raw) ? (raw as ReviewLogPushPayload[]) : [];
      })();

      const remoteDeckConfigs: ProgressPullResponse["deckConfigs"] = (() => {
        if (!pullData || typeof pullData !== "object") return [];
        const raw = (pullData as Partial<ProgressPullResponse>).deckConfigs;
        return Array.isArray(raw) ? (raw as ProgressPullResponse["deckConfigs"]) : [];
      })();

      const changedConfigDeckIds = new Set<number>();

      await db.transaction("rw", db.decks, db.cardStates, db.reviewLogs, async () => {
        if (remoteDeckConfigs.length > 0) {
          for (const cfg of remoteDeckConfigs) {
            if (!cfg || cfg.libraryId !== lib.id) continue;
            const deckId = typeof cfg.deckId === "number" ? cfg.deckId : Number(cfg.deckId);
            const updatedAt = typeof cfg.updatedAt === "number" ? cfg.updatedAt : Number(cfg.updatedAt);
            if (!Number.isFinite(deckId) || deckId <= 0) continue;
            if (!Number.isFinite(updatedAt) || updatedAt <= 0) continue;

            const local = await db.decks.get([lib.id, deckId]);
            const localUpdated = local?.updatedAt ?? 0;
            if (updatedAt <= localUpdated) continue;

            const name =
              local?.name ??
              (lib.deck?.decks?.find((d) => d.id === deckId)?.name ?? "");

            await db.decks.put({
              libraryId: lib.id,
              deckId,
              name,
              newPerDay: Math.max(0, Math.floor(Number(cfg.newPerDay) || 0)),
              reviewsPerDay: Math.max(0, Math.floor(Number(cfg.reviewsPerDay) || 0)),
              cardInfoOpenByDefault: Boolean((cfg as { cardInfoOpenByDefault?: unknown }).cardInfoOpenByDefault),
              writeLanguage: sanitizeWriteLanguage((cfg as { writeLanguage?: unknown }).writeLanguage),
              answerStyles: (() => {
                const remote = (cfg as { answerStyles?: unknown }).answerStyles;
                const allowed: ReviewAnswerStyle[] = ["normal", "write", "multiple-choice", "reverse", "match"];
                if (Array.isArray(remote) && remote.length > 0) {
                  const filtered = remote.filter((x): x is ReviewAnswerStyle => allowed.includes(x as ReviewAnswerStyle));
                  if (filtered.length > 0) return filtered;
                }
                if (Array.isArray(local?.answerStyles) && local.answerStyles.length > 0) return local.answerStyles;
                return DEFAULT_DECK_CONFIG.answerStyles;
              })(),
              hiddenFieldLabels: Array.isArray((cfg as { hiddenFieldLabels?: unknown }).hiddenFieldLabels)
                ? (cfg as { hiddenFieldLabels: string[] }).hiddenFieldLabels
                : (local?.hiddenFieldLabels ?? []),
              pinnedBackFieldLabels: Array.isArray((cfg as { pinnedBackFieldLabels?: unknown }).pinnedBackFieldLabels)
                ? (cfg as { pinnedBackFieldLabels: string[] }).pinnedBackFieldLabels
                : (local?.pinnedBackFieldLabels ?? []),
              easeFactor: (() => { const v = Number((cfg as { easeFactor?: unknown }).easeFactor); return Number.isFinite(v) && v > 0 ? v : (local?.easeFactor ?? undefined); })(),
              createdAt: local?.createdAt ?? updatedAt,
              updatedAt,
            });

            changedConfigDeckIds.add(deckId);
          }
        }

        if (remoteCardStates.length > 0) {
          const keys = remoteCardStates.map((s) => [s.libraryId, s.cardId] as [string, number]);
          const existing = await db.cardStates.bulkGet(keys);
          const toPut: CardStateEntity[] = [];
          for (let i = 0; i < remoteCardStates.length; i += 1) {
            const remote = remoteCardStates[i];
            const local = existing[i] ?? null;

            const shouldTakeRemote = (() => {
              if (!local) return true;

              const remoteUpdated = typeof remote.updatedAt === "number" ? remote.updatedAt : 0;
              const localUpdated = typeof local.updatedAt === "number" ? local.updatedAt : 0;
              if (remoteUpdated > localUpdated) return true;

              const remoteReps = typeof remote.reps === "number" ? remote.reps : 0;
              const localReps = typeof local.reps === "number" ? local.reps : 0;
              if (remoteReps > localReps) return true;

              const remoteLast = typeof remote.lastReview === "number" ? remote.lastReview : 0;
              const localLast = typeof local.lastReview === "number" ? local.lastReview : 0;
              if (remoteLast > localLast) return true;

              return false;
            })();

            if (shouldTakeRemote) toPut.push(remote);
          }
          if (toPut.length > 0) await db.cardStates.bulkPut(toPut);
        }

        if (remoteReviewLogs.length > 0) {
          const remote = remoteReviewLogs
            .map((l) => ({
              ...l,
              syncKey:
                typeof l.syncKey === "string" && l.syncKey
                  ? l.syncKey
                  : computeReviewLogSyncKey(l),
            }))
            .filter((l) => l.libraryId === lib.id);

          const CHUNK = 500;
          const toAdd: ReviewLogPushPayload[] = [];

          for (let i = 0; i < remote.length; i += CHUNK) {
            const chunk = remote.slice(i, i + CHUNK);
            const keys = chunk.map((l) => [lib.id, l.syncKey] as [string, string]);
            const existing = await db.reviewLogs
              .where("[libraryId+syncKey]")
              .anyOf(keys)
              .toArray();
            const existingKeys = new Set(existing.map((e) => String(e.syncKey ?? "")));

            for (const l of chunk) {
              if (!existingKeys.has(l.syncKey)) toAdd.push(l);
            }
          }

          if (toAdd.length > 0) {
            await db.reviewLogs.bulkAdd(toAdd);
          }
        }
      });

      // Refresh cached UI overview for changed deck configs.
      if (changedConfigDeckIds.size > 0) {
        setPhase(`Applying deck settings for “${lib.name}”…`);
        const refs = Array.from(changedConfigDeckIds).map((deckId) => ({
          libraryId: lib.id,
          deckId,
        }));

        const overviews = await Promise.all(
          refs.map(async (ref) => {
            try {
              const ov = await getDeckOverview(ref);
              return [ref, ov] as const;
            } catch {
              return null;
            }
          })
        );

        setDeckOverviews((prev) => {
          const next = { ...prev };
          for (const entry of overviews) {
            if (!entry) continue;
            const key = `${entry[0].libraryId}:${entry[0].deckId}`;
            next[key] = entry[1];
          }
          return next;
        });

        if (reviewRef && reviewRef.libraryId === lib.id && changedConfigDeckIds.has(reviewRef.deckId)) {
          try {
            const cfg = await getDeckConfig(reviewRef);
            setReviewDeckConfig(cfg);
          } catch {
            // ignore
          }
        }
      }

      advance(`Pulled progress for “${lib.name}”.`);
    }

    // Refresh deck list stats now that IndexedDB has been updated.
    setPhase("Refreshing deck stats…");
    const pairs = mergedLibraries.flatMap((lib) =>
      (lib.deck?.decks ?? []).map((d) => ({
        key: `${lib.id}:${d.id}`,
        ref: { libraryId: lib.id, deckId: d.id } satisfies DeckRef,
      }))
    );

    const refreshed: Record<string, DeckOverview> = {};
    const CHUNK = 25;
    for (let i = 0; i < pairs.length; i += CHUNK) {
      const chunk = pairs.slice(i, i + CHUNK);
      const entries = await Promise.all(
        chunk.map(async ({ key, ref }) => {
          try {
            const ov = await getDeckOverview(ref);
            return [key, ov] as const;
          } catch {
            return null;
          }
        })
      );
      for (const e of entries) {
        if (!e) continue;
        refreshed[e[0]] = e[1];
      }
    }

    if (pairs.length > 0) {
      setDeckOverviews((prev) => ({ ...prev, ...refreshed }));
    }

    setPhase("Finalizing sync…");
    const serverTs = maxServerTime;
    const localTs = Date.now();
    setLastSyncAt(serverTs);
    setLastPushAtLocal(localTs);
    await saveLastState({
      libraries: mergedLibraries,
      activeLibraryId: activeLibraryId ?? (mergedLibraries[0]?.id ?? null),
      savedAt: Date.now(),
      lastSyncAt: serverTs,
      lastPushAtLocal: localTs,
    });

    advance("Sync complete.");

    if (uploadWarnings.length > 0) {
      reportError(uploadWarnings.join("\n"));
    }

    if (mergedLibraries.length === 0) {
      reportError("No decks found in cloud.");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    reportError(msg);
  } finally {
    setSyncBusy(false);
    setSyncProgress(null);
  }
}

  async function onReimportApkg(libraryId: string, file: File): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const imported = await importApkg(file, { mediaNamespace: libraryId });
      await upsertImportedDeck(libraryId, imported);
      try {
        await saveApkgFile({ libraryId, file });
      } catch {
        // ignore quota / private-mode errors
      }

      if (!LOCAL_ONLY_MODE) {
        const libraryName = libraries.find((l) => l.id === libraryId)?.name ?? libraryId;
        try {
          await uploadLibraryDeckDataToCloudNow({ libraryId, libraryName });
        } catch {
          // non-fatal — user can sync manually
        }
        try {
          await uploadLibraryMediaToCloudNow({ libraryId, deck: imported });
        } catch {
          // non-fatal — user can sync manually
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Re-import failed");
    } finally {
      setBusy(false);
    }
  }

  return {
    uploadLibraryDeckDataToCloudNow,
    deleteLibraryFromCloudNow,
    onLogout,
    onDevPurgeOtherUsers,
    onDevResetMyCloud,
    onDevDebugLocalProgress,
    onDevDebugCloudProgress,
    onPickFile,
    onLoadDemoDecks,
    onSyncFromCloud,
    onClearSaved,
    onReimportApkg,
  };
}
