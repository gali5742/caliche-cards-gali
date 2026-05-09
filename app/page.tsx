"use client";

import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaCog, FaPlay, FaTimes } from "react-icons/fa";

import type { ImportedDeck } from "../lib/apkg";
import { importApkg } from "../lib/apkg";
import {
  clearLastState,
  loadLastState,
  saveLastState,
  type LibraryItem,
} from "../lib/deckStorage";
import { clearMedia, getMediaBlob, saveMediaItems } from "../lib/mediaStorage";
import { clearApkg, getApkgFile, saveApkgFile } from "../lib/apkgStorage";
import type {
  CardEntity,
  CardStateEntity,
  DeckConfig,
  DeckRef,
  NextCard,
  ReviewAnswerStyle,
  ReviewLogEntity,
} from "../lib/studyTypes";
import {
  answerCard,
  getDeckConfig,
  getDeckOverview,
  getNextCard,
  resetDeckProgress,
  setDeckAnswerStyles,
  setDeckCardInfoOpenByDefault,
  setDeckHiddenFieldLabels,
  setDeckNewPerDay,
  setDeckReviewsPerDay,
  setDeckPinnedBackFieldLabels,
  setDeckWriteLanguage,
  startStudySession,
  upsertImportedDeck,
  type DeckOverview,
} from "../lib/studyApi";
import { deleteStudyDb, getStudyDb } from "../lib/studyDb";
import { DEFAULT_DECK_CONFIG, scheduleAnswer } from "../lib/scheduler";

type Mode = "import" | "review";

type MatchItem = { cardId: number; front: string; back: string; soundFile?: string };

const LOCAL_ONLY_MODE = false;

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
    hiddenFieldLabels?: string[];
    pinnedBackFieldLabels?: string[];
    updatedAt: number;
  }>;
};

function sanitizeWriteLanguage(raw: unknown): DeckConfig["writeLanguage"] {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "fr") return "fr";
  if (v === "es") return "es";
  return "en";
}

function computeReviewLogSyncKey(log: {
  libraryId: string;
  deckId: number;
  cardId: number;
  noteId: number;
  ts: number;
  result: string;
  timeTakenMs?: number;
  prevState: string;
  nextState: string;
  prevDue: number;
  nextDue: number;
  prevIntervalDays: number;
  nextIntervalDays: number;
  prevStepIndex: number;
  nextStepIndex: number;
  prevReps: number;
  nextReps: number;
  prevLapses: number;
  nextLapses: number;
}): string {
  return [
    log.libraryId,
    log.deckId,
    log.cardId,
    log.noteId,
    log.ts,
    log.result,
    log.prevState,
    log.nextState,
    log.prevDue,
    log.nextDue,
    log.prevIntervalDays,
    log.nextIntervalDays,
    log.prevStepIndex,
    log.nextStepIndex,
    log.prevReps,
    log.nextReps,
    log.prevLapses,
    log.nextLapses,
    log.timeTakenMs ?? "",
  ].join("|");
}

function sanitize(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}

type CardPart =
  | { type: "html"; value: string }
  | { type: "sound"; filename: string };

function splitBySoundTag(input: string): CardPart[] {
  const out: CardPart[] = [];
  const re = /\[sound:([^\]]+)\]/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    const start = match.index;
    const end = re.lastIndex;
    const filename = (match[1] ?? "").trim();

    if (start > lastIndex) {
      out.push({ type: "html", value: input.slice(lastIndex, start) });
    }

    if (filename) {
      out.push({ type: "sound", filename });
    } else {
      out.push({ type: "html", value: input.slice(start, end) });
    }

    lastIndex = end;
  }

  if (lastIndex < input.length) {
    out.push({ type: "html", value: input.slice(lastIndex) });
  }

  if (out.length === 0) {
    return [{ type: "html", value: input }];
  }

  return out;
}

function extractFirstSoundFilename(input: string): string | null {
  const re = /\[sound:([^\]]+)\]/i;
  const match = re.exec(String(input ?? ""));
  const filename = (match?.[1] ?? "").trim();
  return filename || null;
}

function soundCandidatesFromFilename(raw: string): string[] {
  const trimmedRaw = String(raw ?? "").trim();
  if (!trimmedRaw) return [];

  let decoded: string | null = null;
  try {
    decoded = decodeURIComponent(trimmedRaw);
  } catch {
    decoded = null;
  }

  const plusAsSpace = trimmedRaw.includes("+")
    ? trimmedRaw.replace(/\+/g, " ")
    : null;
  const decodedPlusAsSpace = decoded && decoded.includes("+")
    ? decoded.replace(/\+/g, " ")
    : null;

  return Array.from(
    new Set(
      [trimmedRaw, decoded ?? "", plusAsSpace ?? "", decodedPlusAsSpace ?? ""]
        .map((s) => String(s ?? "").trim())
        .filter((s) => s.length > 0)
    )
  );
}

const inFlightCloudMediaFetch = new Map<string, Promise<Blob | null>>();

async function downloadMediaBlobFromCloud(
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

async function tryPlayAudioFilename(
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

function SoundButton({
  namespace,
  filename,
  variant = "pill",
  disabled = false,
}: {
  namespace: string;
  filename: string;
  variant?: "pill" | "icon";
  disabled?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePlay() {
    setError(null);
    setIsLoading(true);
    try {
      await tryPlayAudioFilename(namespace, filename);
    } catch (e) {
      if (e instanceof Error && e.message === "blob not found") {
        setError("Audio not found");
      } else {
        setError("Couldn't play audio");
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (variant === "icon") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePlay}
          disabled={isLoading || disabled}
          title={filename}
          aria-label="Play"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
        >
          <FaPlay className="h-4 w-4" aria-hidden="true" />
        </button>
        {error ? <span className="text-xs text-red-400">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={handlePlay}
        disabled={isLoading || disabled}
        title={filename}
        className="inline-flex items-center gap-2 rounded-full border border-foreground/15 px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
      >
        <FaPlay className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{isLoading ? "Loading…" : "Play"}</span>
      </button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

function localMediaCandidatesFromSrc(src: string): string[] {
  const raw = String(src ?? "").trim();
  if (!raw) return [];

  // Ignore remote/inline sources.
  if (/^(?:https?:|data:|blob:|file:|about:)/i.test(raw)) return [];

  const noQuery = raw.split(/[?#]/)[0] ?? raw;
  const name = String(noQuery)
    .replace(/^collection\.media\//i, "")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .trim();

  if (!name) return [];

  const candidates: string[] = [name];

  // Some decks URL-encode media filenames.
  try {
    const decoded = decodeURIComponent(name);
    if (decoded && decoded !== name) candidates.push(decoded);
  } catch {
    // ignore
  }

  // Some templates use + for spaces.
  if (name.includes("+")) candidates.push(name.replace(/\+/g, " "));

  return Array.from(new Set(candidates.map((s) => s.trim()).filter(Boolean)));
}

function extractMediaCandidatesFromHtml(html: string): string[] {
  const input = String(html ?? "");
  if (!input) return [];

  const out = new Set<string>();

  // Sound tags: [sound:filename.mp3]
  {
    const re = /\[sound:([^\]]+)\]/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(input)) !== null) {
      const raw = String(match[1] ?? "").trim();
      if (!raw) continue;
      for (const cand of soundCandidatesFromFilename(raw)) out.add(cand);
    }
  }

  // Image tags: <img src="...">
  {
    const re = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(input)) !== null) {
      const src = String(match[1] ?? match[2] ?? match[3] ?? "").trim();
      if (!src) continue;
      for (const cand of localMediaCandidatesFromSrc(src)) out.add(cand);
    }
  }

  return Array.from(out);
}

function extractDeckMediaCandidates(deck: ImportedDeck): string[] {
  const out = new Set<string>();
  for (const card of deck.cards) {
    for (const cand of extractMediaCandidatesFromHtml(card.frontHtml)) out.add(cand);
    for (const cand of extractMediaCandidatesFromHtml(card.backHtml)) out.add(cand);
    for (const fieldHtml of card.fieldsHtml) {
      for (const cand of extractMediaCandidatesFromHtml(fieldHtml)) out.add(cand);
    }
  }
  return Array.from(out);
}

function preprocessHtmlForLocalImages(html: string): string {
  const input = String(html ?? "");
  if (!input) return input;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, "text/html");
    const imgs = Array.from(doc.querySelectorAll("img"));

    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      const candidates = localMediaCandidatesFromSrc(src);
      if (candidates.length === 0) continue;

      // Prevent the browser from requesting `/<filename>` immediately.
      img.setAttribute("data-caliche-orig-src", src);
      img.setAttribute("data-caliche-src", candidates[0] ?? src);
      img.setAttribute("src", "data:,");
    }

    return doc.body.innerHTML;
  } catch {
    return input;
  }
}

function htmlToText(inputHtml: string): string {
  const input = String(inputHtml ?? "");
  if (!input) return "";

  try {
    const doc = new DOMParser().parseFromString(input, "text/html");
    return String(doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
  } catch {
    // Very small fallback; good enough for label inference.
    return input
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function htmlToTextWithBreaks(inputHtml: string): string {
  const input = String(inputHtml ?? "");
  if (!input) return "";

  try {
    const doc = new DOMParser().parseFromString(input, "text/html");
    // `innerText` preserves <br> and block element line breaks in browsers.
    const raw = String((doc.body as unknown as { innerText?: unknown })?.innerText ?? "");
    return raw.replace(/\r\n?/gu, "\n").replace(/[\t\f\v]+/gu, " ").trim();
  } catch {
    // Fallback: approximate breaks by replacing <br> tags.
    return input
      .replace(/<br\s*\/?\s*>/giu, "\n")
      .replace(/<[^>]*>/gu, " ")
      .replace(/\s+\n\s+/gu, "\n")
      .trim();
  }
}

function normalizeLabel(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function escapeRegExp(input: string): string {
  return String(input ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toWriteChars(input: string): string[] {
  const normalized = String(input ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/gu, " ");
  if (!normalized) return [];

  // Keep letters (including accents), spaces, and common word punctuation.
  const chars = Array.from(normalized);
  return chars.filter((ch) => /\p{L}/u.test(ch) || ch === " " || ch === "'" || ch === "-");
}

function extractWriteWordFromText(text: string): string | null {
  const t = String(text ?? "").trim();
  if (!t) return null;

  // Find the first "phrase-like" token containing letters, allowing spaces between words.
  // Example: "go on with"
  const re = /[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)*/gu;
  const match = re.exec(t);
  const picked = String(match?.[0] ?? "");
  const chars = toWriteChars(picked);
  return chars.length > 0 ? chars.join("") : null;
}

function normalizeChoiceText(input: string): string {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function extractMultipleChoiceAnswerFromBackHtml(backHtml: string): string | null {
  const t = htmlToTextWithBreaks(backHtml);
  if (!t) return null;

  // "First element" heuristic: first non-empty line, then before common separators.
  const firstLine =
    t
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "";
  if (!firstLine) return null;

  const beforeSep = firstLine
    .split(/\s*(?:•|\||;|\/|·)\s*/u)[0]
    ?.trim();

  const picked = String(beforeSep ?? firstLine).replace(/\s+/gu, " ").trim();
  return picked ? picked : null;
}

function extractReverseChoiceFromFrontHtml(frontHtml: string): string | null {
  const t = htmlToTextWithBreaks(frontHtml);
  if (!t) return null;

  // Remove literal sound tags that survive HTML parsing.
  const cleaned = t.replace(/\[sound:[^\]]+\]/giu, " ");

  const firstLine =
    cleaned
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "";
  if (!firstLine) return null;

  const beforeSep = firstLine
    .split(/\s*(?:•|\||;|\/|·)\s*/u)[0]
    ?.trim();

  const picked = String(beforeSep ?? firstLine).replace(/\s+/gu, " ").trim();
  return picked ? picked : null;
}

function capitalizeFirstLetter(s: string): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toLocaleUpperCase() + t.slice(1);
}

function extractMultipleChoiceAnswerFromCard(card: {
  frontHtml: string;
  backHtml: string;
  fieldsHtml?: unknown;
  fieldNames?: unknown;
}, pinnedNorm?: string[]): string | null {
  const fieldsHtml = Array.isArray(card.fieldsHtml)
    ? (card.fieldsHtml as unknown[]).map((x) => String(x ?? ""))
    : undefined;
  const fieldNames = Array.isArray(card.fieldNames)
    ? (card.fieldNames as unknown[]).map((x) => String(x ?? ""))
    : undefined;

  // Pinned fields are the most reliable source — use the first one if configured.
  const pinned = pickFieldSectionsByLabel({
    fieldsHtml,
    fieldNames,
    labelNormalizedInOrder: pinnedNorm ?? PINNED_BACK_FIELD_LABELS_NORMALIZED,
  });
  if (pinned[0]?.valueHtml) {
    return extractMultipleChoiceAnswerFromBackHtml(pinned[0].valueHtml);
  }

  // No pinned field: scan backHtml line by line and return the first line that
  // is not empty and not identical to the card front. Many Anki templates
  // repeat the front word at the top of the back, so we must skip it.
  const frontText = htmlToText(card.frontHtml).replace(/\[sound:[^\]]+\]/gi, "").trim().toLowerCase();
  const lines = htmlToTextWithBreaks(card.backHtml)
    .split("\n")
    .map((s) => s.replace(/\[sound:[^\]]+\]/gi, "").trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.toLowerCase() === frontText) continue;
    const beforeSep = line.split(/\s*(?:•|\||;|\/|·)\s*/u)[0]?.trim();
    const answer = String(beforeSep ?? line).replace(/\s+/gu, " ").trim();
    if (answer && answer.toLowerCase() !== frontText) return answer;
  }

  return null;
}

function pickWriteTargetFromCard(card: {
  frontHtml: string;
  backHtml: string;
  fieldsHtml?: unknown;
  fieldNames?: unknown;
}): string | null {
  // Per product requirement: Write expects the word from the FRONT.
  const fromFront = extractWriteWordFromText(htmlToText(card.frontHtml));
  return fromFront;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const arr = items.slice();
  if (arr.length <= 1) return arr;

  // xmur3 + mulberry32 (tiny deterministic PRNG)
  const xmur3 = (str: string) => {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i += 1) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  };

  const mulberry32 = (a: number) => {
    return () => {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const seedFn = xmur3(seed);
  const rand = mulberry32(seedFn());

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j] as T;
    arr[j] = tmp as T;
  }

  return arr;
}

const HIDDEN_FIELD_LABELS_NORMALIZED = new Set<string>();
const PINNED_BACK_FIELD_LABELS_NORMALIZED: string[] = [];

function shouldHideFieldLabel(label: string, hiddenNorm?: Set<string>) {
  const target = normalizeLabel(label);
  if (!target) return false;
  return (hiddenNorm ?? HIDDEN_FIELD_LABELS_NORMALIZED).has(target);
}

function inferFieldLabelsForHtml(args: {
  html: string;
  fieldsHtml?: string[];
  fieldNames?: string[];
  hiddenNorm?: Set<string>;
}): string[] {
  const htmlText = htmlToText(args.html).toLowerCase();
  if (!htmlText) return [];

  const fields = Array.isArray(args.fieldsHtml) ? args.fieldsHtml : [];
  const names = Array.isArray(args.fieldNames) ? args.fieldNames : [];

  const out: string[] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const fieldText = htmlToText(String(fields[i] ?? "")).toLowerCase();
    if (!fieldText) continue;

    const isShort = fieldText.length < 4;
    const matches = isShort ? htmlText === fieldText : htmlText.includes(fieldText);
    if (!matches) continue;

    const label = String(names[i] ?? "").trim() || `Field ${i + 1}`;
    if (shouldHideFieldLabel(label, args.hiddenNorm)) continue;
    if (!out.includes(label)) out.push(label);
  }

  return out;
}
 
function inferFieldSectionsForHtml(args: {
  html: string;
  fieldsHtml?: string[];
  fieldNames?: string[];
  hiddenNorm?: Set<string>;
}): Array<{ index: number; label: string; valueHtml: string }> {
  const htmlText = htmlToText(args.html).toLowerCase();
  if (!htmlText) return [];

  const fields = Array.isArray(args.fieldsHtml) ? args.fieldsHtml : [];
  const names = Array.isArray(args.fieldNames) ? args.fieldNames : [];

  const out: Array<{ index: number; label: string; valueHtml: string }> = [];
  for (let i = 0; i < fields.length; i += 1) {
    const valueHtml = String(fields[i] ?? "");
    const fieldText = htmlToText(valueHtml).toLowerCase();
    if (!fieldText) continue;

    const isShort = fieldText.length < 4;
    const matches = isShort ? htmlText === fieldText : htmlText.includes(fieldText);
    if (!matches) continue;

    const label = String(names[i] ?? "").trim() || `Field ${i + 1}`;
    if (shouldHideFieldLabel(label, args.hiddenNorm)) continue;
    out.push({ index: i, label, valueHtml });
  }

  return out;
}

function pickFieldSectionsByLabel(args: {
  fieldsHtml?: string[];
  fieldNames?: string[];
  labelNormalizedInOrder: string[];
}): Array<{ index: number; label: string; valueHtml: string }> {
  const fields = Array.isArray(args.fieldsHtml) ? args.fieldsHtml : [];
  const names = Array.isArray(args.fieldNames) ? args.fieldNames : [];
  if (fields.length === 0 || names.length === 0) return [];

  const normNames = names.map(normalizeLabel);
  const out: Array<{ index: number; label: string; valueHtml: string }> = [];

  for (const wantedNorm of args.labelNormalizedInOrder) {
    if (!wantedNorm) continue;
    const idx = normNames.findIndex((n) => n === wantedNorm);
    if (idx < 0) continue;
    const valueHtml = String(fields[idx] ?? "");
    if (!valueHtml.trim()) continue;

    const label = String(names[idx] ?? "").trim() || `Field ${idx + 1}`;
    out.push({ index: idx, label, valueHtml });
  }

  return out;
}

function HtmlWithMedia({
  namespace,
  html,
}: {
  namespace: string;
  html: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const revokeAll = () => {
      for (const url of objectUrlsRef.current) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      objectUrlsRef.current = [];
    };

    revokeAll();
    const root = ref.current;
    if (!root) {
      return () => {
        cancelled = true;
        revokeAll();
      };
    }

    // Important: set innerHTML imperatively so React won't overwrite any
    // attribute changes we apply (like swapping img src to blob: URLs).
    root.innerHTML = html;

    const imgs = Array.from(root.querySelectorAll("img"));
    if (imgs.length === 0) {
      return () => {
        cancelled = true;
        revokeAll();
      };
    }

    void (async () => {
      let resolvedCount = 0;
      let missingCount = 0;

      let attemptedRepair = false;
      let attemptedCloud = false;

      const ensureMediaFromCloud = async (name: string): Promise<Blob | null> => {
        if (attemptedCloud) {
          // Still allow multiple names, but avoid hammering if user is offline.
        }

        const blob = await downloadMediaBlobFromCloud(namespace, name);
        attemptedCloud = true;
        if (!blob) return null;

        try {
          await saveMediaItems(namespace, [{ name, blob }]);
          return blob;
        } catch {
          return null;
        }
      };

      const ensureMediaFromCachedApkg = async (): Promise<boolean> => {
        if (attemptedRepair) return false;
        attemptedRepair = true;

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

      for (const img of imgs) {
        if (cancelled) return;

        const rawSrc =
          img.getAttribute("data-caliche-src") ??
          img.getAttribute("data-caliche-orig-src") ??
          img.getAttribute("src") ??
          "";
        const candidates = localMediaCandidatesFromSrc(rawSrc);
        if (candidates.length === 0) continue;

        let blob: Blob | null = null;
        let resolved: string | null = null;
        for (const cand of candidates) {
          blob = await getMediaBlob(namespace, cand);
          if (blob) {
            resolved = cand;
            break;
          }
        }
        if (!blob) {
          // Try cloud first so media works cross-device.
          for (const cand of candidates) {
            const cloudBlob = await ensureMediaFromCloud(cand);
            if (cloudBlob) {
              blob = cloudBlob;
              resolved = cand;
              break;
            }
          }

          const repaired = await ensureMediaFromCachedApkg();
          if (repaired) {
            for (const cand of candidates) {
              blob = await getMediaBlob(namespace, cand);
              if (blob) {
                resolved = cand;
                break;
              }
            }
          }

          if (blob) {
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.push(url);

            if (cancelled) {
              try {
                URL.revokeObjectURL(url);
              } catch {
                // ignore
              }
              continue;
            }

            img.setAttribute("src", url);
            if (resolved) img.setAttribute("data-caliche-media", resolved);
            img.removeAttribute("data-caliche-missing");
            resolvedCount += 1;
            continue;
          }

          missingCount += 1;
          img.setAttribute("data-caliche-missing", "1");
          continue;
        }

        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);

        if (cancelled) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
          continue;
        }

        img.setAttribute("src", url);
        if (resolved) img.setAttribute("data-caliche-media", resolved);
        img.removeAttribute("data-caliche-missing");
        resolvedCount += 1;
      }

      if (process.env.NODE_ENV !== "production") {
        if (resolvedCount > 0 || missingCount > 0) {
          console.info(
            "[media] images resolved=",
            resolvedCount,
            "missing=",
            missingCount,
            "namespace=",
            namespace
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      revokeAll();
    };
  }, [namespace, html]);

  return <div ref={ref} />;
}

function CardFace({
  namespace,
  html,
  className,
  suppressFirstSoundFilename,
  soundDisabled,
}: {
  namespace: string;
  html: string;
  className?: string;
  suppressFirstSoundFilename?: string | null;
  soundDisabled?: boolean;
}) {
  const parts = useMemo(() => {
    const base = splitBySoundTag(String(html ?? "")).map((p) => {
      if (p.type === "html") {
        const safe = sanitize(p.value);
        return { ...p, value: preprocessHtmlForLocalImages(safe) };
      }
      return p;
    });

    if (!suppressFirstSoundFilename) return base;
    let removed = false;
    return base.filter((p) => {
      if (
        !removed &&
        p.type === "sound" &&
        p.filename === suppressFirstSoundFilename
      ) {
        removed = true;
        return false;
      }
      return true;
    });
  }, [html, suppressFirstSoundFilename]);

  return (
    <div
      className={`text-foreground [&_a]:underline [&_a:hover]:opacity-80 [&_br]:block [&_img]:block [&_img]:mx-auto [&_img]:max-w-full [&_img]:h-auto [&_img]:max-h-[45vh] sm:[&_img]:max-h-[60vh] [&_img]:object-contain [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ${className ?? "text-base leading-7"}`}
    >
      {parts.map((p, idx) => {
        if (p.type === "sound") {
          return (
            <div key={`sound-${idx}-${p.filename}`} className="my-2">
              <SoundButton
                namespace={namespace}
                filename={p.filename}
                disabled={Boolean(soundDisabled)}
              />
            </div>
          );
        }

        return (
          <HtmlWithMedia
            key={`html-${idx}`}
            namespace={namespace}
            html={p.value}
          />
        );
      })}
    </div>
  );
}

function FieldsList({
  namespace,
  fields,
  names,
  defaultOpen,
  hiddenNorm,
}: {
  namespace: string;
  fields: string[] | undefined;
  names: string[] | undefined;
  defaultOpen?: boolean;
  hiddenNorm?: Set<string>;
}) {
  const [isOpen, setIsOpen] = useState(() => Boolean(defaultOpen));

  const list = (fields ?? []).map((v) => String(v ?? ""));
  const labelList = (names ?? []).map((n) => String(n ?? "").trim());

  const nonEmpty = list
    .map((value, index) => ({
      index,
      value: value.trim(),
      label: labelList[index] || `Field ${index + 1}`,
    }))
    .filter((x) => x.value !== "")
    .filter((x) => !shouldHideFieldLabel(x.label, hiddenNorm));

  if (nonEmpty.length === 0) return null;

  return (
    <div className="rounded-2xl border border-foreground/15 p-4">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 text-left text-xs font-medium text-foreground/70"
      >
        <span>Card info</span>
        <span className="flex items-center gap-2 text-[11px] font-medium text-foreground/60">
          <span>{isOpen ? "Hide" : "Show"}</span>
          <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 flex flex-col gap-3">
          {nonEmpty.map(({ index, value, label }) => (
            <div key={index} className="rounded-xl border border-foreground/10 p-3">
              {label ? (
                <div className="mb-1 text-[11px] font-medium text-foreground/60">
                  {label}
                </div>
              ) : null}
              <CardFace namespace={namespace} html={value} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("import");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const devPurgeEnabled =
    process.env.NODE_ENV !== "production" &&
    /^(1|true)$/i.test(String(process.env.NEXT_PUBLIC_ENABLE_DEV_PURGE || ""));

  const [authUser, setAuthUser] = useState<{ username: string } | null | undefined>(undefined);

  const [syncBusy, setSyncBusy] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastPushAtLocal, setLastPushAtLocal] = useState<number | null>(null);
  const [syncProgress, setSyncProgress] = useState<
    | {
        done: number;
        total: number;
        phase: string;
      }
    | null
  >(null);

  const [libraries, setLibraries] = useState<LibraryItem[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showAnswer, setShowAnswer] = useState(false);
  const [cardAppearanceToken, setCardAppearanceToken] = useState(0);
  const [reviewAnswerStyle, setReviewAnswerStyle] = useState<ReviewAnswerStyle>("normal");
  const [writePicked, setWritePicked] = useState<Array<{ index: number; ch: string }>>([]);
  const [writeOutcome, setWriteOutcome] = useState<"correct" | "wrong" | null>(null);
  type WriteDrag = { fromIdx: number; ch: string; x: number; y: number; dropIdx: number };
  const [writeDrag, setWriteDrag] = useState<WriteDrag | null>(null);
  const writeDragRef = useRef<WriteDrag | null>(null);
  const writePickedRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [mcOutcome, setMcOutcome] = useState<"correct" | "wrong" | null>(null);
  const [mcSelectedIndex, setMcSelectedIndex] = useState<number | null>(null);
  const [reverseOutcome, setReverseOutcome] = useState<"correct" | "wrong" | null>(null);
  const [reverseSelectedIndex, setReverseSelectedIndex] = useState<number | null>(null);
  const [mcAnswerPool, setMcAnswerPool] = useState<string[]>([]);
  const [mcReviewedPool, setMcReviewedPool] = useState<string[]>([]);
  const [mcAnswerPoolKey, setMcAnswerPoolKey] = useState<string | null>(null);
  const [reverseFrontPool, setReverseFrontPool] = useState<string[]>([]);
  const [reverseFrontPoolKey, setReverseFrontPoolKey] = useState<string | null>(null);
  const [reviewRef, setReviewRef] = useState<DeckRef | null>(null);
  const [current, setCurrent] = useState<NextCard | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewOverview, setReviewOverview] = useState<DeckOverview | null>(null);
  const [deckOverviews, setDeckOverviews] = useState<Record<string, DeckOverview>>({});
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [reviewDeckConfig, setReviewDeckConfig] = useState<DeckConfig | null>(null);

  const activeHiddenNorm = useMemo<Set<string>>(() => {
    const labels = reviewDeckConfig?.hiddenFieldLabels ?? [];
    return new Set<string>(labels.map(normalizeLabel));
  }, [reviewDeckConfig]);

  const activePinnedNorm = useMemo<string[]>(() => {
    const labels = reviewDeckConfig?.pinnedBackFieldLabels ?? [];
    return labels.map(normalizeLabel);
  }, [reviewDeckConfig]);

  // ── Match answer-style state ─────────────────────────────────────────────
  const [matchPool, setMatchPool] = useState<MatchItem[]>([]);
  const [matchPoolKey, setMatchPoolKey] = useState<string | null>(null);
  const [matchItems, setMatchItems] = useState<MatchItem[]>([]);
  const [matchRightOrder, setMatchRightOrder] = useState<number[]>([]);
  const [matchOutcome, setMatchOutcome] = useState<"correct" | "wrong" | null>(null);
  // matchAssigned[wordSlot] = bottom-answer-index or null (sequential assignment)
  const [matchAssigned, setMatchAssigned] = useState<(number | null)[]>([]);
  const [matchSubmitted, setMatchSubmitted] = useState(false);
  // matchCardResults[slot] = true if that slot was correctly matched (set on submit)
  const [matchCardResults, setMatchCardResults] = useState<boolean[]>([]);
  const [matchCardPreview, setMatchCardPreview] = useState<{ item: MatchItem; card: CardEntity } | null>(null);

  // Prevent double autoplay from re-renders; reset when the card appearance changes.
  const lastAutoPlayedCardAppearanceTokenRef = useRef<number | null>(null);

  // Reverse: autoplay once when user reveals (showAnswer becomes true).
  const lastReverseRevealAutoPlayedCardAppearanceTokenRef = useRef<number | null>(null);

  // The per-card style is chosen in an effect; keep the chosen value in a ref so
  // other effects (like autoplay) can avoid running with stale style state.
  const chosenAnswerStyleForCardIdRef = useRef<
    { cardId: number; style: ReviewAnswerStyle } | null
  >(null);

  // Prevent slow/stale async updates when rapidly advancing cards.
  const loadNextSeqRef = useRef(0);
  const lastOverviewRefreshAtRef = useRef(0);

  // Randomize per-card answer style (50/50) when a new card is shown.

  useEffect(() => {
    (async () => {
      try {
        const { state, clearedOld } = await loadLastState();
        if (clearedOld) {
          setError(
            "Saved data format was updated. Re-import your .apkg to apply the changes."
          );
        }
        if (!state) return;
        setLibraries(state.libraries ?? []);
        setActiveLibraryId(state.activeLibraryId ?? null);
        setLastSyncAt(state.lastSyncAt ?? null);
        setLastPushAtLocal(() => {
          const raw = (state as { lastPushAtLocal?: unknown }).lastPushAtLocal;
          const n = typeof raw === "number" ? raw : Number(raw);
          return Number.isFinite(n) && n > 0 ? n : null;
        });
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data: unknown = await res.json().catch(() => null);
        const user = (() => {
          if (!data || typeof data !== "object") return null;
          if (!("user" in data)) return null;
          const raw = (data as { user?: unknown }).user;
          if (raw == null) return null;
          if (!raw || typeof raw !== "object") return null;
          const username = (raw as { username?: unknown }).username;
          if (typeof username !== "string" || !username.trim()) return null;
          return { username };
        })();
        if (!cancelled) setAuthUser(user);
      } catch {
        if (!cancelled) setAuthUser(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const uiLibraries = useMemo(() => {
    if (authUser) {
      return libraries.filter((l) => (l as { source?: unknown }).source !== "guest");
    }
    return libraries;
  }, [authUser, libraries]);

  type DeckDataEnvelopeV1 = {
    version: 1;
    deck: ImportedDeck;
  };

  const fetchWithTimeout = useCallback(
    async (
      input: RequestInfo | URL,
      init: RequestInit | undefined,
      timeoutMs: number,
      label: string
    ): Promise<Response> => {
      const controller = new AbortController();
      const existingSignal = init?.signal;

      if (existingSignal) {
        if (existingSignal.aborted) controller.abort();
        else {
          existingSignal.addEventListener("abort", () => controller.abort(), {
            once: true,
          });
        }
      }

      const id = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, { ...init, signal: controller.signal });
      } catch (e: unknown) {
        const aborted =
          controller.signal.aborted ||
          (e instanceof DOMException && e.name === "AbortError");
        if (aborted) {
          throw new Error(`${label} timed out. Please try again.`);
        }
        throw e;
      } finally {
        window.clearTimeout(id);
      }
    },
    []
  );

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

  async function exportDeckDataFromStudyDb(libraryId: string): Promise<ImportedDeck> {
    const db = getStudyDb();

    const [decks, cards] = await Promise.all([
      db.decks.where("libraryId").equals(libraryId).toArray(),
      db.cards.where("libraryId").equals(libraryId).toArray(),
    ]);

    if (decks.length === 0 || cards.length === 0) {
      throw new Error(
        "This deck isn't available locally yet. Try opening it once, or re-import the .apkg."
      );
    }

    return {
      decks: decks
        .map((d) => ({ id: d.deckId, name: d.name }))
        .sort((a, b) => a.id - b.id),
      cards: cards
        .map((c) => ({
          id: c.cardId,
          deckId: c.deckId,
          noteId: c.noteId,
          frontHtml: c.frontHtml,
          backHtml: c.backHtml,
          fieldsHtml: c.fieldsHtml,
          fieldNames: c.fieldNames,
        }))
        .sort((a, b) => a.id - b.id),
    } satisfies ImportedDeck;
  }

  async function gzipBytes(bytes: Uint8Array, timeoutMs = 8_000): Promise<Uint8Array | null> {
    if (typeof CompressionStream === "undefined") return null;

    const compress = async (): Promise<Uint8Array> => {
      const cs = new CompressionStream("gzip");
      const writer = cs.writable.getWriter();
      const copied = new Uint8Array(bytes);
      await writer.write(copied);
      await writer.close();
      const outBuf = await new Response(cs.readable).arrayBuffer();
      return new Uint8Array(outBuf);
    };

    try {
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return await compress();
      }

      const timed = await Promise.race<Uint8Array | null>([
        compress(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
      ]);

      return timed;
    } catch {
      return null;
    }
  }

  async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      const ds = new DecompressionStream("gzip");
      const writer = ds.writable.getWriter();
      const copied = new Uint8Array(bytes);
      await writer.write(copied);
      await writer.close();
      const outBuf = await new Response(ds.readable).arrayBuffer();
      return new Uint8Array(outBuf);
    } catch {
      return null;
    }
  }

  async function encodeDeckDataFile(deck: ImportedDeck): Promise<File> {
    const envelope: DeckDataEnvelopeV1 = { version: 1, deck };
    const json = JSON.stringify(envelope);
    const raw = new TextEncoder().encode(json);
    const gz = await gzipBytes(raw, 8_000);

    if (gz) {
      const copied = new Uint8Array(gz);
      return new File([copied], "deck.json.gz", { type: "application/gzip" });
    }

    const copied = new Uint8Array(raw);
    return new File([copied], "deck.json", { type: "application/json" });
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

  async function decodeDeckDataBlob(blob: Blob): Promise<ImportedDeck> {
    const ct = (blob.type || "").toLowerCase();
    const buf = new Uint8Array(await blob.arrayBuffer());

    let jsonText: string;
    if (ct.includes("gzip") || ct.includes("x-gzip")) {
      const raw = await gunzipBytes(buf);
      if (!raw) {
        throw new Error(
          "Your browser can't decompress this deck format. Please update your browser or re-import the .apkg on this device."
        );
      }
      jsonText = new TextDecoder().decode(raw);
    } else {
      jsonText = new TextDecoder().decode(buf);
    }

    const parsed: unknown = JSON.parse(jsonText);
    const deck = (() => {
      if (parsed && typeof parsed === "object" && "deck" in parsed) {
        return (parsed as { deck?: unknown }).deck;
      }
      return parsed;
    })();

    if (!deck || typeof deck !== "object") {
      throw new Error("Invalid deck data");
    }

    const decksRaw = (deck as { decks?: unknown }).decks;
    const cardsRaw = (deck as { cards?: unknown }).cards;
    if (!Array.isArray(decksRaw) || !Array.isArray(cardsRaw)) {
      throw new Error("Invalid deck data");
    }

    return deck as ImportedDeck;
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

  function isMissingLocalDeckDataError(e: unknown): boolean {
    return (
      e instanceof Error &&
      /isn't available locally yet/i.test(e.message)
    );
  }

  async function recoverDeckDataFromCachedApkg(libraryId: string): Promise<ImportedDeck | null> {
    const stored = await getApkgFile(libraryId).catch(() => null);
    if (!stored) return null;

    const file = new File([stored.blob], stored.filename || "deck.apkg", {
      type: "application/octet-stream",
    });

    const imported = await importApkg(file, { mediaNamespace: libraryId });
    // Re-seed StudyDB to restore local availability.
    await upsertImportedDeck(libraryId, imported);
    return imported;
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

  const onLogout = useCallback(async () => {
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
  }, []);

  const onDevPurgeOtherUsers = useCallback(async () => {
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
  }, [devPurgeEnabled, authUser]);

  const onDevResetMyCloud = useCallback(async () => {
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
  }, [devPurgeEnabled, authUser, libraries, activeLibraryId]);

  const onDevDebugLocalProgress = useCallback(async () => {
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
  }, [devPurgeEnabled, uiLibraries]);

  const onDevDebugCloudProgress = useCallback(async () => {
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
  }, [devPurgeEnabled, authUser]);

  const activeLibrary = useMemo(() => {
    if (uiLibraries.length === 0) return null;
    const found = uiLibraries.find((l) => l.id === activeLibraryId);
    return found ?? uiLibraries[0] ?? null;
  }, [uiLibraries, activeLibraryId]);

  const activeNamespace = activeLibrary?.id ?? "default";
  const activeDeck = activeLibrary?.deck ?? null;
  const selectedDeckId = activeLibrary?.selectedDeckId ?? null;

  const selectedDeckName = useMemo(() => {
    if (!activeDeck || selectedDeckId == null) return null;
    return activeDeck.decks.find((d) => d.id === selectedDeckId)?.name ?? null;
  }, [activeDeck, selectedDeckId]);

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
                answerStyles:
                  Array.isArray(local?.answerStyles) && local.answerStyles.length > 0
                    ? local.answerStyles
                    : DEFAULT_DECK_CONFIG.answerStyles,
                hiddenFieldLabels: Array.isArray((cfg as { hiddenFieldLabels?: unknown }).hiddenFieldLabels)
                  ? (cfg as { hiddenFieldLabels: string[] }).hiddenFieldLabels
                  : (local?.hiddenFieldLabels ?? []),
                pinnedBackFieldLabels: Array.isArray((cfg as { pinnedBackFieldLabels?: unknown }).pinnedBackFieldLabels)
                  ? (cfg as { pinnedBackFieldLabels: string[] }).pinnedBackFieldLabels
                  : (local?.pinnedBackFieldLabels ?? []),
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

  const [openDeckMenu, setOpenDeckMenu] = useState<
    { libraryId: string; deckId: number } | null
  >(null);
  const [editingDeck, setEditingDeck] = useState<
    { libraryId: string; deckId: number; value: string } | null
  >(null);
  const [limitsModal, setLimitsModal] = useState<{
    libraryId: string;
    deckId: number;
    newPerDay: string;
    reviewsPerDay: string;
  } | null>(null);
  const [cardTypesModal, setCardTypesModal] = useState<{
    libraryId: string;
    deckId: number;
    styles: ReviewAnswerStyle[];
  } | null>(null);
  const [fieldConfigModal, setFieldConfigModal] = useState<{
    type: "hidden" | "pinned";
    libraryId: string;
    deckId: number;
    allFields: string[];
    current: string[];
  } | null>(null);
  const [showCountersInfo, setShowCountersInfo] = useState(false);

  async function getDeckFieldNames(libraryId: string, deckId: number): Promise<string[]> {
    const db = getStudyDb();
    const cards = await db.cards.where("[libraryId+deckId]").equals([libraryId, deckId]).toArray();
    const seen = new Set<string>();
    for (const card of cards) {
      for (const name of card.fieldNames) {
        if (name) seen.add(name);
      }
    }
    return [...seen];
  }

  const commitNewPerDay = useCallback(
    async (libraryId: string, deckId: number, raw: string) => {
      const next = Number(raw);
      await setDeckNewPerDay({ libraryId, deckId }, next);

      // Optimistically reflect in UI even if overview refresh lags.
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            config: {
              ...existing.config,
              newPerDay: Math.max(0, Math.floor(next || 0)),
            },
          },
        };
      });

      const ov = await getDeckOverview({ libraryId, deckId });
      setDeckOverviews((prev) => ({ ...prev, [`${libraryId}:${deckId}`]: ov }));

      if (reviewRef?.libraryId === libraryId && reviewRef.deckId === deckId) {
        setReviewOverview(ov);
        const cfg = await getDeckConfig({ libraryId, deckId });
        setReviewDeckConfig(cfg);
      }
    },
    [reviewRef]
  );

  const commitReviewsPerDay = useCallback(
    async (libraryId: string, deckId: number, raw: string) => {
      const next = Number(raw);
      await setDeckReviewsPerDay({ libraryId, deckId }, next);

      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            config: {
              ...existing.config,
              reviewsPerDay: Math.max(0, Math.floor(next || 0)),
            },
          },
        };
      });

      const ov = await getDeckOverview({ libraryId, deckId });
      setDeckOverviews((prev) => ({ ...prev, [`${libraryId}:${deckId}`]: ov }));

      if (reviewRef?.libraryId === libraryId && reviewRef.deckId === deckId) {
        setReviewOverview(ov);
        const cfg = await getDeckConfig({ libraryId, deckId });
        setReviewDeckConfig(cfg);
      }
    },
    [reviewRef]
  );

  const commitCardInfoDefaultOpen = useCallback(
    async (libraryId: string, deckId: number, next: boolean) => {
      await setDeckCardInfoOpenByDefault({ libraryId, deckId }, next);

      // Optimistically reflect in UI even if overview refresh lags.
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            config: {
              ...existing.config,
              cardInfoOpenByDefault: Boolean(next),
            },
          },
        };
      });

      const ov = await getDeckOverview({ libraryId, deckId });
      setDeckOverviews((prev) => ({ ...prev, [`${libraryId}:${deckId}`]: ov }));

      if (reviewRef?.libraryId === libraryId && reviewRef.deckId === deckId) {
        setReviewOverview(ov);
        const cfg = await getDeckConfig({ libraryId, deckId });
        setReviewDeckConfig(cfg);
      }
    },
    [reviewRef]
  );

  const commitDeckAnswerStyles = useCallback(
    async (libraryId: string, deckId: number, next: ReviewAnswerStyle[]) => {
      await setDeckAnswerStyles({ libraryId, deckId }, next);

      // Optimistically reflect in UI even if overview refresh lags.
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            config: {
              ...existing.config,
              answerStyles: next,
            },
          },
        };
      });

      const ov = await getDeckOverview({ libraryId, deckId });
      setDeckOverviews((prev) => ({ ...prev, [`${libraryId}:${deckId}`]: ov }));

      if (reviewRef?.libraryId === libraryId && reviewRef.deckId === deckId) {
        setReviewOverview(ov);
        const cfg = await getDeckConfig({ libraryId, deckId });
        setReviewDeckConfig(cfg);
      }
    },
    [reviewRef]
  );

  const commitDeckWriteLanguage = useCallback(
    async (libraryId: string, deckId: number, next: DeckConfig["writeLanguage"]) => {
      await setDeckWriteLanguage({ libraryId, deckId }, next);

      // Optimistically reflect in UI even if overview refresh lags.
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            config: {
              ...existing.config,
              writeLanguage: next,
            },
          },
        };
      });

      const ov = await getDeckOverview({ libraryId, deckId });
      setDeckOverviews((prev) => ({ ...prev, [`${libraryId}:${deckId}`]: ov }));

      if (reviewRef?.libraryId === libraryId && reviewRef.deckId === deckId) {
        setReviewOverview(ov);
        const cfg = await getDeckConfig({ libraryId, deckId });
        setReviewDeckConfig(cfg);
      }
    },
    [reviewRef]
  );

  const commitDeckHiddenFieldLabels = useCallback(
    async (libraryId: string, deckId: number, next: string[]) => {
      await setDeckHiddenFieldLabels({ libraryId, deckId }, next);

      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            config: { ...existing.config, hiddenFieldLabels: next },
          },
        };
      });

      const ov = await getDeckOverview({ libraryId, deckId });
      setDeckOverviews((prev) => ({ ...prev, [`${libraryId}:${deckId}`]: ov }));

      if (reviewRef?.libraryId === libraryId && reviewRef.deckId === deckId) {
        setReviewOverview(ov);
        const cfg = await getDeckConfig({ libraryId, deckId });
        setReviewDeckConfig(cfg);
      }
    },
    [reviewRef]
  );

  const commitDeckPinnedBackFieldLabels = useCallback(
    async (libraryId: string, deckId: number, next: string[]) => {
      await setDeckPinnedBackFieldLabels({ libraryId, deckId }, next);

      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            config: { ...existing.config, pinnedBackFieldLabels: next },
          },
        };
      });

      const ov = await getDeckOverview({ libraryId, deckId });
      setDeckOverviews((prev) => ({ ...prev, [`${libraryId}:${deckId}`]: ov }));

      if (reviewRef?.libraryId === libraryId && reviewRef.deckId === deckId) {
        setReviewOverview(ov);
        const cfg = await getDeckConfig({ libraryId, deckId });
        setReviewDeckConfig(cfg);
      }
    },
    [reviewRef]
  );

  useEffect(() => {
    if (!openDeckMenu) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Element)) {
        setOpenDeckMenu(null);
        return;
      }
      if (target.closest('[data-deck-menu-root="true"]')) return;
      setOpenDeckMenu(null);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openDeckMenu]);

  useEffect(() => {
    if (libraries.length === 0) return;

    let cancelled = false;
    void (async () => {
      const pairs = libraries.flatMap((lib) =>
        lib.deck.decks.map((d) => ({
          key: `${lib.id}:${d.id}`,
          ref: { libraryId: lib.id, deckId: d.id } satisfies DeckRef,
        }))
      );

      const entries = await Promise.all(
        pairs.map(async ({ key, ref }) => {
          try {
            const ov = await getDeckOverview(ref);
            return [key, ov] as const;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;
      const next: Record<string, DeckOverview> = {};
      for (const e of entries) {
        if (!e) continue;
        next[e[0]] = e[1];
      }
      setDeckOverviews(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [libraries]);

  function updateLibrary(libraryId: string, updater: (item: LibraryItem) => LibraryItem) {
    setLibraries((prev) => {
      const next = prev.map((l) => (l.id === libraryId ? updater(l) : l));
      void saveLastState({
        libraries: next,
        activeLibraryId: activeLibraryId ?? libraryId,
        savedAt: Date.now(),
      });
      return next;
    });
  }

  function renameDeck(libraryId: string, deckId: number, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    updateLibrary(libraryId, (item) => ({
      ...item,
      deck: {
        ...item.deck,
        decks: item.deck.decks.map((d) =>
          d.id === deckId ? { ...d, name: trimmed } : d
        ),
      },
    }));

    // Persist rename in StudyDB.
    void (async () => {
      try {
        const now = Date.now();
        const db = getStudyDb();
        const updated = await db.decks.update([libraryId, deckId], {
          name: trimmed,
          updatedAt: now,
        });
        if (updated === 0) {
          await db.decks.put({
            libraryId,
            deckId,
            name: trimmed,
            newPerDay: DEFAULT_DECK_CONFIG.newPerDay,
            reviewsPerDay: DEFAULT_DECK_CONFIG.reviewsPerDay,
            cardInfoOpenByDefault: DEFAULT_DECK_CONFIG.cardInfoOpenByDefault,
            answerStyles: DEFAULT_DECK_CONFIG.answerStyles,
            writeLanguage: DEFAULT_DECK_CONFIG.writeLanguage,
            createdAt: now,
            updatedAt: now,
          });
        }

      } catch {
        setError("Renamed locally, but failed to save the rename.");
      }
    })();
  }

  async function deleteDeck(libraryId: string, deckId: number) {
    const lib = libraries.find((l) => l.id === libraryId);
    if (!lib) return;
    const deck = lib.deck.decks.find((d) => d.id === deckId);
    if (!deck) return;
    const name = deck.name;
    const toDeleteNames = new Set<string>([name]);
    for (const d of lib.deck.decks) {
      if (d.name.startsWith(`${name}::`)) toDeleteNames.add(d.name);
    }
    const toDeleteIds = new Set<number>(
      lib.deck.decks.filter((d) => toDeleteNames.has(d.name)).map((d) => d.id)
    );

    const remainingDecks = lib.deck.decks.filter((d) => !toDeleteIds.has(d.id));

    setError(null);
    setBusy(true);
    try {
      const ids = Array.from(toDeleteIds);
      const db = getStudyDb();

      // Delete all study DB rows tied to these deckIds.
      await db.transaction("rw", db.decks, db.cards, db.cardStates, db.reviewLogs, async () => {
        // Cards + states
        const cardKeysToDelete: Array<[string, number]> = [];
        for (const id of ids) {
          const cards = await db.cards
            .where("[libraryId+deckId]")
            .equals([libraryId, id])
            .toArray();

          for (const c of cards) {
            cardKeysToDelete.push([libraryId, c.cardId]);
          }
        }

        if (cardKeysToDelete.length > 0) {
          await Promise.all([
            db.cardStates.bulkDelete(cardKeysToDelete),
            db.cards.bulkDelete(cardKeysToDelete),
          ]);
        }

        // Review logs (primary key is auto-incremented numeric id)
        for (const id of ids) {
          const logs = await db.reviewLogs
            .where("[libraryId+deckId+ts]")
            .between(
              [libraryId, id, 0],
              [libraryId, id, Number.MAX_SAFE_INTEGER],
              true,
              true
            )
            .toArray();
          const logIds = logs
            .map((l) => l.id)
            .filter((x): x is number => typeof x === "number");
          if (logIds.length > 0) {
            await db.reviewLogs.bulkDelete(logIds);
          }
        }

        // Deck rows
        await db.decks.bulkDelete(ids.map((id) => [libraryId, id] as [string, number]));
      });

      // If the currently open review deck got deleted, exit review to avoid inconsistent state.
      if (reviewRef && reviewRef.libraryId === libraryId && toDeleteIds.has(reviewRef.deckId)) {
        setMode("import");
        setShowAnswer(false);
        setReviewRef(null);
        setCurrent(null);
        setReviewOverview(null);
      }

      // Update UI + persisted state.
      updateLibrary(libraryId, (item) => {
        const nextDecks = item.deck.decks.filter((d) => !toDeleteIds.has(d.id));
        const nextSelected =
          item.selectedDeckId != null && toDeleteIds.has(item.selectedDeckId)
            ? (nextDecks[0]?.id ?? null)
            : item.selectedDeckId;

        return {
          ...item,
          selectedDeckId: nextSelected,
          deck: { decks: nextDecks },
        };
      });

      // Remove cached overviews for deleted decks.
      setDeckOverviews((prev) => {
        const next = { ...prev };
        for (const id of toDeleteIds) {
          delete next[`${libraryId}:${id}`];
        }
        return next;
      });

      if (!LOCAL_ONLY_MODE) {
        // Best-effort: reflect deletes in cloud.
        try {
          for (const id of Array.from(toDeleteIds)) {
            const res = await fetchWithTimeout(
              "/api/sync/progress/reset",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ libraryId, deckId: id }),
              },
              30_000,
              "Cloud reset"
            );
            if (res.status !== 401 && !res.ok) throw new Error("Cloud reset failed");
          }

          if (remainingDecks.length === 0) {
            await deleteLibraryFromCloudNow(libraryId);
          } else {
            // Upload updated deck data (deck list + cards) so other devices stop seeing deleted decks.
            await uploadLibraryDeckDataToCloudNow({ libraryId, libraryName: lib.name });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Cloud update failed";
          setError(`Deleted locally, but failed to update cloud. (${msg})`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete deck";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const onResetDeckProgress = useCallback(
    async (args: { libraryId: string; deckId: number; deckName: string }) => {
      const { libraryId, deckId, deckName } = args;
      const ok = confirm(
        `Reset progress for “${deckName}”?\n\nThis will clear scheduling and review history for this deck.`
      );
      if (!ok) return;

      setError(null);
      setBusy(true);
      try {
        await resetDeckProgress({ libraryId, deckId });

        const ov = await getDeckOverview({ libraryId, deckId });
        setDeckOverviews((prev) => ({ ...prev, [`${libraryId}:${deckId}`]: ov }));

        if (reviewRef?.libraryId === libraryId && reviewRef.deckId === deckId) {
          // Exit review to avoid inconsistent state.
          setMode("import");
          setShowAnswer(false);
          setReviewRef(null);
          setCurrent(null);
          setReviewOverview(null);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to reset progress";
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [reviewRef]
  );

  async function loadNext(ref: DeckRef, excludeCardId?: number) {
    // Show the next card ASAP; refresh overview in the background.
    const seq = (loadNextSeqRef.current += 1);
    const key = `${ref.libraryId}:${ref.deckId}`;

    let next = await getNextCard(ref, {
      learnAheadMs: 60 * 60 * 1000,
      learnAheadMode: "learn+relearn",
      excludeCardId,
    });

    // If nothing was found while excluding the just-answered card, retry without
    // the exclusion — it may be the only card available (single learn/relearn card
    // due soon). The exclude is a soft preference, not a hard rule.
    if (next == null && excludeCardId != null) {
      if (loadNextSeqRef.current !== seq) return;
      next = await getNextCard(ref, {
        learnAheadMs: 60 * 60 * 1000,
        learnAheadMode: "learn+relearn",
      });
    }

    if (loadNextSeqRef.current !== seq) return;
    setCurrent(next);
    setShowAnswer(false);
    if (next) setCardAppearanceToken((t) => t + 1);

    // Avoid heavy overview scans on every card; it can stall the UI.
    // Refresh occasionally (and always when we run out of cards).
    const now = Date.now();
    const shouldRefreshOverview = next == null || now - lastOverviewRefreshAtRef.current > 1500;
    if (!shouldRefreshOverview) return;
    lastOverviewRefreshAtRef.current = now;

    void getDeckOverview(ref)
      .then((ov) => {
        if (loadNextSeqRef.current !== seq) return;
        setReviewOverview(ov);
        setDeckOverviews((prev) => ({ ...prev, [key]: ov }));
      })
      .catch(() => {
        // Ignore: overview is best-effort UI state.
      });
  }

  // Keep a lightweight clock for countdown UI.
  useEffect(() => {
    if (mode !== "review") return;
    const id = window.setInterval(() => setNowTs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [mode]);

  // If nothing is due right now but we have a next due timestamp, auto-refresh
  // when it becomes due so the user doesn't need to exit/re-enter.
  useEffect(() => {
    if (mode !== "review") return;
    if (!reviewRef) return;
    if (current) return;
    const ts = reviewOverview?.nextAvailableTs ?? reviewOverview?.nextDueTs ?? null;
    if (ts == null) return;

    const MAX_TIMEOUT_MS = 2_147_483_647; // setTimeout max (~24.8 days)
    const delayMs = Math.min(MAX_TIMEOUT_MS, Math.max(250, ts - Date.now()));
    const id = window.setTimeout(() => {
      void loadNext(reviewRef);
    }, delayMs);

    return () => window.clearTimeout(id);
  }, [mode, reviewRef, current, reviewOverview?.nextAvailableTs, reviewOverview?.nextDueTs]);

  async function beginReview(libraryId: string, deckId: number) {
    if (syncBusy) return;
    setError(null);
    setReviewBusy(true);

    const ref: DeckRef = { libraryId, deckId };
    try {
      const db = getStudyDb();
      const cardsCount = await db.cards.where("[libraryId+deckId]").equals([libraryId, deckId]).count();
      if (cardsCount === 0) {
        setError("That deck has no cards.");
        return;
      }

      const cfg = await getDeckConfig(ref);
      setReviewDeckConfig(cfg);

      const mcEnabled = cfg.answerStyles.includes("multiple-choice");
      if (mcEnabled) {
        try {
          const { all, reviewed } = await preloadMcAnswerPool(ref);
          setMcAnswerPool(all);
          setMcReviewedPool(reviewed);
          setMcAnswerPoolKey(`${ref.libraryId}:${ref.deckId}`);
        } catch {
          setMcAnswerPool([]);
          setMcReviewedPool([]);
          setMcAnswerPoolKey(null);
        }
      } else {
        setMcAnswerPool([]);
        setMcReviewedPool([]);
        setMcAnswerPoolKey(null);
      }

      const reverseEnabled = cfg.answerStyles.includes("reverse");
      if (reverseEnabled) {
        try {
          const pool = await preloadReverseFrontPool(ref);
          setReverseFrontPool(pool);
          setReverseFrontPoolKey(`${ref.libraryId}:${ref.deckId}`);
        } catch {
          setReverseFrontPool([]);
          setReverseFrontPoolKey(null);
        }
      } else {
        setReverseFrontPool([]);
        setReverseFrontPoolKey(null);
      }

      if (cfg.answerStyles.includes("match")) {
        try {
          const pool = await preloadMatchPool(ref);
          setMatchPool(pool);
          setMatchPoolKey(`${ref.libraryId}:${ref.deckId}`);
        } catch {
          setMatchPool([]);
          setMatchPoolKey(null);
        }
      } else {
        setMatchPool([]);
        setMatchPoolKey(null);
      }

      setReviewRef(ref);
      setMode("review");

      // Show the first card ASAP. `startStudySession` can be expensive (it scans
      // card states to unbury), so run it in the background.
      await loadNext(ref);
      window.setTimeout(() => {
        void startStudySession(ref).catch(() => {
          // Best-effort cleanup; ignore failures.
        });
      }, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error starting review";
      setError(msg);
    } finally {
      setReviewBusy(false);
    }
  }

  function startReviewFor(libraryId: string, deckId: number) {
    if (syncBusy) return;
    const lib = libraries.find((l) => l.id === libraryId) ?? null;
    if (!lib) return;

    setActiveLibraryId(libraryId);
    updateLibrary(libraryId, (item) => ({ ...item, selectedDeckId: deckId }));
    void beginReview(libraryId, deckId);
  }

  async function onAnswer(result: "fail" | "pass") {
    if (!reviewRef || !current) return;
    setReviewBusy(true);
    try {
      if (
        reviewAnswerStyle === "match" &&
        matchItems.length > 0 &&
        matchCardResults.length === matchItems.length
      ) {
        // Score every card shown in the match game with its individual result.
        for (let i = 0; i < matchItems.length; i++) {
          const item = matchItems[i]!;
          const cardResult: "pass" | "fail" = matchCardResults[i] ? "pass" : "fail";
          await answerCard(reviewRef, item.cardId, cardResult);
        }
        await loadNext(reviewRef, current.card.cardId);
      } else {
        const answeredId = current.card.cardId;
        await answerCard(reviewRef, answeredId, result);
        await loadNext(reviewRef, answeredId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error saving answer";
      setError(msg);
    } finally {
      setReviewBusy(false);
    }
  }

  function formatIn(ts: number, now: number): string {
    const ms = ts - now;
    if (ms <= 0) return "now";
    const totalSec = Math.ceil(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const totalMin = Math.ceil(totalSec / 60);
    if (totalMin < 60) return `${totalMin}m`;
    const totalHr = Math.ceil(totalMin / 60);
    if (totalHr < 24) return `${totalHr}h`;
    const totalDay = Math.ceil(totalHr / 24);
    return `${totalDay}d`;
  }

  const nextDueLabels = useMemo(() => {
    if (!current || !reviewDeckConfig) return null;

    const fail = scheduleAnswer(current.state, "fail", nowTs, reviewDeckConfig);
    const pass = scheduleAnswer(current.state, "pass", nowTs, reviewDeckConfig);

    return {
      fail: formatIn(fail.nextDue, nowTs),
      pass: formatIn(pass.nextDue, nowTs),
    };
  }, [current, reviewDeckConfig, nowTs]);

  const currentId = current?.card.cardId ?? null;
  const currentMissingFields =
    !!current &&
    (!Array.isArray(current.card.fieldsHtml) || current.card.fieldsHtml.length === 0);

  const writeExpected = useMemo(() => {
    if (!current) return null;
    return pickWriteTargetFromCard({
      frontHtml: current.card.frontHtml,
      backHtml: current.card.backHtml,
      fieldsHtml: current.card.fieldsHtml,
      fieldNames: current.card.fieldNames,
    });
  }, [current]);

  const writeExpectedChars = useMemo(() => {
    if (!writeExpected) return [];
    return toWriteChars(writeExpected);
  }, [writeExpected]);

  const mcCorrectAnswer = useMemo(() => {
    if (!current) return null;
    return extractMultipleChoiceAnswerFromCard({
      frontHtml: current.card.frontHtml,
      backHtml: current.card.backHtml,
      fieldsHtml: current.card.fieldsHtml,
      fieldNames: current.card.fieldNames,
    }, activePinnedNorm);
  }, [current, activePinnedNorm]);

  const mcDecoysForCard = useMemo(() => {
    if (!mcCorrectAnswer) return [];
    const wantsKey = reviewRef ? `${reviewRef.libraryId}:${reviewRef.deckId}` : null;
    if (mcAnswerPoolKey !== wantsKey) return [];
    const correctKey = normalizeChoiceText(mcCorrectAnswer);
    return mcAnswerPool.filter((x) => normalizeChoiceText(x) !== correctKey);
  }, [mcAnswerPool, mcCorrectAnswer, mcAnswerPoolKey, reviewRef]);

  const mcOptions = useMemo(() => {
    if (!currentId) return [];
    if (!mcCorrectAnswer) return [];

    const seed = `${currentId}:${normalizeChoiceText(mcCorrectAnswer)}`;
    const correctKey = normalizeChoiceText(mcCorrectAnswer);

    // Partition: reviewed cards (excluding correct) vs rest
    const reviewedDecoys = seededShuffle(
      mcReviewedPool.filter((x) => normalizeChoiceText(x) !== correctKey),
      `${seed}:reviewed`
    );
    const reviewedKeys = new Set(reviewedDecoys.map((x) => normalizeChoiceText(x)));
    const otherDecoys = seededShuffle(
      mcDecoysForCard.filter((x) => !reviewedKeys.has(normalizeChoiceText(x))),
      `${seed}:other`
    );

    // Pick 1–2 randomly from reviewed, fill remaining with others
    const nReviewed = reviewedDecoys.length === 0 ? 0 : 1 + Math.floor(Math.random() * Math.min(2, reviewedDecoys.length));
    const pickedReviewed = reviewedDecoys.slice(0, nReviewed);
    const pickedOther = otherDecoys.slice(0, 3 - pickedReviewed.length);
    const pickedDecoys = [...pickedReviewed, ...pickedOther];

    const uniq: Array<{ label: string; key: string }> = [];
    const seen = new Set<string>();
    const add = (label: string) => {
      const key = normalizeChoiceText(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      uniq.push({ label, key });
    };

    add(mcCorrectAnswer);
    for (const d of pickedDecoys) add(d);

    if (uniq.length < 2) return [];

    const shuffled = seededShuffle(uniq, `${seed}:options`);
    return shuffled.map((o) => ({
      label: o.label,
      isCorrect: o.key === correctKey,
    }));
  }, [currentId, mcCorrectAnswer, mcDecoysForCard, mcReviewedPool]);

  const answerFieldSections = useMemo(() => {
    if (!current) return [];
    return inferFieldSectionsForHtml({
      html: current.card.backHtml,
      fieldsHtml: current.card.fieldsHtml,
      fieldNames: current.card.fieldNames,
      hiddenNorm: activeHiddenNorm,
    });
  }, [current, activeHiddenNorm]);

  const pinnedBackSections = useMemo(() => {
    if (!current) return [];
    return pickFieldSectionsByLabel({
      fieldsHtml: current.card.fieldsHtml,
      fieldNames: current.card.fieldNames,
      labelNormalizedInOrder: activePinnedNorm,
    });
  }, [current, activePinnedNorm]);

  const reversePromptHtml = useMemo(() => {
    if (!current) return null;

    // Prefer the first pinned field (Definitions 1, etc). Otherwise, use the
    // first inferred back section; else fallback to raw backHtml.
    const pinnedFirst = pinnedBackSections[0]?.valueHtml ?? null;
    const inferredFirst = answerFieldSections[0]?.valueHtml ?? null;
    const raw = pinnedFirst ?? inferredFirst ?? current.card.backHtml;
    const s = String(raw ?? "");
    return s.trim() ? s : null;
  }, [current, pinnedBackSections, answerFieldSections]);

  const reverseCorrectFront = useMemo(() => {
    if (!current) return null;
    return extractReverseChoiceFromFrontHtml(current.card.frontHtml);
  }, [current]);

  const reverseDecoysForCard = useMemo(() => {
    if (!reverseCorrectFront) return [];
    const wantsKey = reviewRef ? `${reviewRef.libraryId}:${reviewRef.deckId}` : null;
    if (reverseFrontPoolKey !== wantsKey) return [];
    const correctKey = normalizeChoiceText(reverseCorrectFront);
    return reverseFrontPool.filter((x) => normalizeChoiceText(x) !== correctKey);
  }, [reverseCorrectFront, reverseFrontPool, reverseFrontPoolKey, reviewRef]);

  const reverseOptions = useMemo(() => {
    if (!currentId) return [];
    if (!reverseCorrectFront) return [];
    if (!reversePromptHtml) return [];

    const seed = `${currentId}:${normalizeChoiceText(reverseCorrectFront)}`;

    // Partition into confusable (share ≥1 word with correct) vs other,
    // using a seeded shuffle only to distribute ties consistently within each group.
    const correctWords = new Set(
      normalizeChoiceText(reverseCorrectFront)
        .split(/\s+/)
        .filter((w) => w.length >= 2)
    );
    const confusable: string[] = [];
    const other: string[] = [];
    for (const d of seededShuffle(reverseDecoysForCard, `${seed}:decoys`)) {
      const dWords = normalizeChoiceText(d).split(/\s+/);
      const overlaps = dWords.some((w) => w.length >= 2 && correctWords.has(w));
      if (overlaps) confusable.push(d);
      else other.push(d);
    }

    // Pick randomly from each group every time the card is shown so distractors
    // vary across reviews. Take up to 3 from confusable first, fill with other.
    const randShuffle = <T,>(arr: T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    };
    const pickedDecoys = [...randShuffle(confusable), ...randShuffle(other)].slice(0, 3);

    const correctKey = normalizeChoiceText(reverseCorrectFront);
    const uniq: Array<{ label: string; key: string }> = [];
    const seen = new Set<string>();
    const add = (label: string) => {
      const key = normalizeChoiceText(label);
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      uniq.push({ label: capitalizeFirstLetter(label), key });
    };

    add(reverseCorrectFront);
    for (const d of pickedDecoys) add(d);

    if (uniq.length < 2) return [];

    const shuffled = seededShuffle(uniq, `${seed}:options`);
    return shuffled.map((o) => ({
      label: o.label,
      isCorrect: o.key === correctKey,
    }));
  }, [currentId, reverseCorrectFront, reverseDecoysForCard, reversePromptHtml]);

  const writeBank = useMemo(() => {
    if (writeExpectedChars.length === 0) return [];
    const seed = `${currentId ?? ""}:${writeExpectedChars.join("")}`;

    // Add extra "noise" letters so the answer isn't trivial.
    const extraCount = Math.min(10, Math.max(4, Math.ceil(writeExpectedChars.length * 0.75)));

    const expectedSet = new Set(
      writeExpectedChars
        .map((c) => c.normalize("NFKC").toLowerCase())
        .filter(Boolean)
    );

    const baseAlphabet = Array.from("abcdefghijklmnopqrstuvwxyz");
    const writeLanguage: DeckConfig["writeLanguage"] =
      reviewDeckConfig?.writeLanguage ?? DEFAULT_DECK_CONFIG.writeLanguage;
    const extrasAlphabet =
      writeLanguage === "fr"
        ? Array.from("àâäæçéèêëîïôœùûüÿ")
        : writeLanguage === "es"
          ? Array.from("áéíóúüñ")
          : [];
    const poolLower = baseAlphabet.concat(extrasAlphabet);

    const wantsUpper = writeExpectedChars.length > 0 && writeExpectedChars.every((c) => c === c.toUpperCase());
    const pool = poolLower
      .filter((c) => !expectedSet.has(c.normalize("NFKC").toLowerCase()))
      .map((c) => (wantsUpper ? c.toUpperCase() : c));

    let decoys: string[] = [];
    if (pool.length > 0) {
      // If we need more than pool size, repeat with different seeds.
      let remaining = extraCount;
      let round = 0;
      while (remaining > 0) {
        const batch = seededShuffle(pool, `${seed}:decoys:${round}`);
        decoys = decoys.concat(batch.slice(0, remaining));
        remaining -= Math.min(remaining, batch.length);
        round += 1;
        if (round > 5) break;
      }
    }

    const all = writeExpectedChars.concat(decoys);
    const shuffled = seededShuffle(all, `${seed}:bank`);

    // Avoid the trivial "not scrambled" case when possible.
    const same = shuffled.length === writeExpectedChars.length && shuffled.every((ch, i) => ch === writeExpectedChars[i]);
    return same ? seededShuffle(all, `${seed}:bank:alt`) : shuffled;
  }, [currentId, writeExpectedChars, reviewDeckConfig?.writeLanguage]);

  const writeUsed = useMemo(() => {
    return new Set(writePicked.map((p) => p.index));
  }, [writePicked]);

  const writeIsAvailable = reviewAnswerStyle === "write" && writeExpectedChars.length > 0;
  const mcCanRun = Boolean(mcCorrectAnswer) && mcDecoysForCard.length > 0;
  const reverseCanRun = Boolean(reversePromptHtml) && Boolean(reverseCorrectFront) && reverseDecoysForCard.length > 0;

  async function preloadMcAnswerPool(ref: DeckRef): Promise<{ all: string[]; reviewed: string[] }> {
    const db = getStudyDb();
    const [cards, states] = await Promise.all([
      db.cards.where("[libraryId+deckId]").equals([ref.libraryId, ref.deckId]).limit(400).toArray(),
      db.cardStates
        .where("[libraryId+deckId+due]")
        .between([ref.libraryId, ref.deckId, 0], [ref.libraryId, ref.deckId, Number.MAX_SAFE_INTEGER], true, true)
        .filter((s) => s.reps > 0)
        .toArray(),
    ]);

    const reviewedCardIds = new Set(states.map((s) => s.cardId));

    const all: string[] = [];
    const reviewed: string[] = [];
    const seen = new Set<string>();
    for (const c of cards) {
      const a = extractMultipleChoiceAnswerFromCard({
        frontHtml: c.frontHtml,
        backHtml: c.backHtml,
        fieldsHtml: c.fieldsHtml,
        fieldNames: c.fieldNames,
      }, activePinnedNorm);
      if (!a) continue;
      const key = normalizeChoiceText(a);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push(a);
      if (reviewedCardIds.has(c.cardId)) reviewed.push(a);
      if (all.length >= 160) break;
    }
    return { all, reviewed };
  }

  async function preloadReverseFrontPool(ref: DeckRef): Promise<string[]> {
    const db = getStudyDb();
    const cards = await db.cards
      .where("[libraryId+deckId]")
      .equals([ref.libraryId, ref.deckId])
      .limit(400)
      .toArray();

    const fronts: string[] = [];
    const seen = new Set<string>();
    for (const c of cards) {
      const a = extractReverseChoiceFromFrontHtml(c.frontHtml);
      if (!a) continue;
      const key = normalizeChoiceText(a);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      fronts.push(a);
      if (fronts.length >= 220) break;
    }
    return fronts;
  }

  async function preloadMatchPool(ref: DeckRef): Promise<MatchItem[]> {
    const db = getStudyDb();
    const now = Date.now();
    const states = await db.cardStates
      .where("[libraryId+deckId+due]")
      .between([ref.libraryId, ref.deckId, 0], [ref.libraryId, ref.deckId, now], true, true)
      .filter((s) => s.reps > 0 && !s.suspended && (s.buriedUntil == null || s.buriedUntil <= now))
      .toArray();

    const cardIds = [...new Set(states.map((s) => s.cardId))].slice(0, 200);
    if (cardIds.length === 0) return [];

    const cards = await db.cards
      .where("[libraryId+cardId]")
      .anyOf(cardIds.map((id) => [ref.libraryId, id]))
      .toArray();

    const items: MatchItem[] = [];
    const seenFront = new Set<string>();
    const seenBack = new Set<string>();
    for (const c of cards) {
      const front = htmlToText(c.frontHtml).replace(/\[sound:[^\]]+\]/gi, "").trim();
      const back =
        extractMultipleChoiceAnswerFromCard({
          frontHtml: c.frontHtml,
          backHtml: c.backHtml,
          fieldsHtml: c.fieldsHtml,
          fieldNames: c.fieldNames,
        }, activePinnedNorm) ?? htmlToText(c.backHtml).replace(/\[sound:[^\]]+\]/gi, "").trim();
      if (!front || !back) continue;
      const fk = normalizeChoiceText(front);
      const bk = normalizeChoiceText(back);
      if (!fk || !bk || seenFront.has(fk) || seenBack.has(bk)) continue;
      seenFront.add(fk);
      seenBack.add(bk);
      const soundMatch = /\[sound:([^\]]+)\]/i.exec(c.backHtml) ?? /\[sound:([^\]]+)\]/i.exec(c.frontHtml);
      const soundFile = soundMatch?.[1]?.trim() ?? undefined;
      items.push({ cardId: c.cardId, front, back, soundFile });
      if (items.length >= 160) break;
    }
    return items;
  }

  useEffect(() => {
    if (mode !== "review") return;
    if (currentId == null) return;

    const rand01 = () => {
      try {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return (buf[0] ?? 0) / 4294967296;
      } catch {
        return Math.random();
      }
    };

    const enabledStyles: ReviewAnswerStyle[] =
      reviewDeckConfig?.answerStyles?.length
        ? reviewDeckConfig.answerStyles
        : ["normal", "write", "multiple-choice", "reverse", "match"];

    const canWrite = writeExpectedChars.length > 0;
    const canMc = Boolean(mcCorrectAnswer) && mcDecoysForCard.length > 0;
    const canReverse = Boolean(reversePromptHtml) && Boolean(reverseCorrectFront) && reverseDecoysForCard.length > 0;
    const canMatch =
      current?.state.state !== "new" &&
      Boolean(mcCorrectAnswer) &&
      matchPoolKey === `${reviewRef?.libraryId}:${reviewRef?.deckId}` &&
      matchPool.filter((p) => p.cardId !== current?.card.cardId).length >= 1;

    // Build a weighted pool where every enabled style always occupies its fair
    // share of slots. Styles that can't run for this card collapse to "normal"
    // so that match never gets a higher-than-intended share just because
    // write/mc/reverse lack distractors for this specific card.
    const weightedPool: ReviewAnswerStyle[] = enabledStyles.map((s) => {
      if (s === "write") return canWrite ? "write" : "normal";
      if (s === "multiple-choice") return canMc ? "multiple-choice" : "normal";
      if (s === "reverse") return canReverse ? "reverse" : "normal";
      if (s === "match") return canMatch ? "match" : "normal";
      return "normal";
    });

    if (weightedPool.length === 0) weightedPool.push("normal");

    const idx = Math.min(weightedPool.length - 1, Math.floor(rand01() * weightedPool.length));
    const chosen = weightedPool[idx] ?? "normal";

    chosenAnswerStyleForCardIdRef.current = { cardId: currentId, style: chosen };
    setReviewAnswerStyle(chosen);

    // Always start a new card unflipped.
    setShowAnswer(false);
  }, [
    mode,
    currentId,
    reviewDeckConfig?.answerStyles,
    writeExpectedChars.length,
    mcCorrectAnswer,
    mcDecoysForCard.length,
    reversePromptHtml,
    reverseCorrectFront,
    reverseDecoysForCard.length,
    current?.state.state,
    current?.card.cardId,
    matchPool,
    matchPoolKey,
    reviewRef?.libraryId,
    reviewRef?.deckId,
  ]);

  useEffect(() => {
    // Reset all answer-style state when the card or style changes.
    setWritePicked([]);
    setWriteOutcome(null);
    writeDragRef.current = null;
    setWriteDrag(null);
    setMcOutcome(null);
    setMcSelectedIndex(null);
    setReverseOutcome(null);
    setReverseSelectedIndex(null);
    setMatchItems([]);
    setMatchRightOrder([]);
    setMatchOutcome(null);
    setMatchAssigned([]);
    setMatchSubmitted(false);
    setMatchCardResults([]);
    setMatchCardPreview(null);
  }, [currentId, reviewAnswerStyle]);

  // Build the per-card match game when style is "match".
  useEffect(() => {
    if (mode !== "review") return;
    if (reviewAnswerStyle !== "match") return;
    if (!current || !mcCorrectAnswer || !reviewRef) return;
    const wantsKey = `${reviewRef.libraryId}:${reviewRef.deckId}`;
    if (matchPoolKey !== wantsKey) return;

    const currentFront = htmlToText(current.card.frontHtml).replace(/\[sound:[^\]]+\]/gi, "").trim();
    const currentBack = mcCorrectAnswer;
    const currentSoundMatch =
      /\[sound:([^\]]+)\]/i.exec(current.card.backHtml) ??
      /\[sound:([^\]]+)\]/i.exec(current.card.frontHtml);
    const currentItem: MatchItem = {
      cardId: current.card.cardId,
      front: currentFront,
      back: currentBack,
      soundFile: currentSoundMatch?.[1]?.trim() ?? undefined,
    };

    const seed = `${current.card.cardId}:match`;
    const currentBackKey = normalizeChoiceText(currentBack);
    const candidates = seededShuffle(
      matchPool.filter(
        (p) => p.cardId !== current.card.cardId && normalizeChoiceText(p.back) !== currentBackKey
      ),
      `${seed}:cands`
    );

    if (candidates.length === 0) return;

    // Pick a random count between 2 and min(10, total available)
    const maxCount = Math.min(10, 1 + candidates.length);
    const n = maxCount <= 2 ? 2 : 2 + Math.floor(Math.random() * (maxCount - 1));
    const distractors = candidates.slice(0, n - 1);

    const items: MatchItem[] = [currentItem, ...distractors];
    const rightOrder = seededShuffle(items.map((_, i) => i), `${seed}:right`);

    setMatchItems(items);
    setMatchRightOrder(rightOrder);
    setMatchAssigned(items.map(() => null));
    setMatchCardResults(items.map(() => false));
    setMatchSubmitted(false);
  }, [mode, reviewAnswerStyle, currentId, current, matchPool, matchPoolKey, reviewRef, mcCorrectAnswer]);

  useEffect(() => {
    if (mode !== "review") return;
    if (reviewAnswerStyle !== "write") return;
    if (!current) return;
    if (showAnswer) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Backspace") return;
      if (writePicked.length === 0) return;
      e.preventDefault();
      writeDragRef.current = null;
      setWriteDrag(null);
      setWritePicked((prev) => prev.slice(0, -1));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, reviewAnswerStyle, currentId, current, showAnswer, writePicked.length]);

  // Drag-and-drop reordering for write mode picked letters.
  useEffect(() => {
    if (!writeDrag) return;

    const onMove = (e: PointerEvent) => {
      const cur = writeDragRef.current;
      if (!cur) return;
      const x = e.clientX;
      const y = e.clientY;

      const refs = writePickedRefs.current;
      let dropIdx = refs.length;
      let bestDist = Infinity;
      for (let i = 0; i < refs.length; i++) {
        const el = refs[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < bestDist) {
          bestDist = dist;
          dropIdx = x <= cx ? i : i + 1;
        }
      }

      const next = { ...cur, x, y, dropIdx };
      writeDragRef.current = next;
      setWriteDrag(next);
    };

    const onUp = () => {
      const cur = writeDragRef.current;
      if (!cur) return;
      const { fromIdx, dropIdx } = cur;
      setWritePicked((prev) => {
        if (dropIdx === fromIdx || dropIdx === fromIdx + 1) return prev;
        const moving = prev[fromIdx];
        const without = prev.filter((_, i) => i !== fromIdx);
        const adj = dropIdx > fromIdx ? dropIdx - 1 : dropIdx;
        return [...without.slice(0, adj), moving, ...without.slice(adj)];
      });
      writeDragRef.current = null;
      setWriteDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeDrag !== null]);

  // Write evaluation happens only on explicit Submit.

  const promotedSound = useMemo(() => {
    if (!current) return null;
    const fromFront = extractFirstSoundFilename(current.card.frontHtml);
    if (fromFront) return { filename: fromFront, source: "front" as const };
    const fromBack = extractFirstSoundFilename(current.card.backHtml);
    if (fromBack) return { filename: fromBack, source: "back" as const };
    return null;
  }, [current]);

  const isReverseAudioLocked = mode === "review" && reviewAnswerStyle === "reverse" && !showAnswer;

  const currentTimingTag = useMemo(() => {
    if (!current) return null;

    const isNew = current.state?.state === "new";
    if (isNew) {
      return { kind: "new" as const, label: "New", detail: null };
    }

    const due = typeof current.state?.due === "number" ? current.state.due : 0;
    if (!Number.isFinite(due)) return { kind: "due", label: "Due", detail: null };
    const isWaiting = due > nowTs;
    return {
      kind: isWaiting ? "waiting" : "due",
      label: isWaiting ? "Waiting" : "Due",
      detail: isWaiting ? `in ${formatIn(due, nowTs)}` : null,
    };
  }, [current, nowTs]);

  const answerFieldLabels = useMemo(() => {
    if (!current) return [];
    return inferFieldLabelsForHtml({
      html: current.card.backHtml,
      fieldsHtml: current.card.fieldsHtml,
      fieldNames: current.card.fieldNames,
      hiddenNorm: activeHiddenNorm,
    });
  }, [current, activeHiddenNorm]);

  const answerFieldLabelsWithoutPinned = useMemo(() => {
    if (answerFieldLabels.length === 0) return [];
    const pinned = new Set(activePinnedNorm);
    return answerFieldLabels.filter((l) => !pinned.has(normalizeLabel(l)));
  }, [answerFieldLabels, activePinnedNorm]);

  const pinnedBackSectionIndexes = useMemo(() => {
    return new Set(pinnedBackSections.map((s) => s.index));
  }, [pinnedBackSections]);

  const answerFieldSectionsWithoutPinned = useMemo(() => {
    if (pinnedBackSectionIndexes.size === 0) return answerFieldSections;
    return answerFieldSections.filter((sec) => !pinnedBackSectionIndexes.has(sec.index));
  }, [answerFieldSections, pinnedBackSectionIndexes]);

  const pinnedBackRender = useMemo(() => {
    const filename =
      promotedSound?.source === "back" ? promotedSound.filename : null;
    if (!filename) {
      return {
        didSuppressPromotedBackSound: false,
        sections: pinnedBackSections.map((s) => ({
          ...s,
          suppressFirstSoundFilename: null as string | null,
        })) as Array<
          {
            index: number;
            label: string;
            valueHtml: string;
            suppressFirstSoundFilename: string | null;
          }
        >,
      };
    }

    const re = new RegExp(`\\[sound:\\s*${escapeRegExp(filename)}\\s*\\]`, "i");
    let suppressed = false;

    const sections: Array<{
      index: number;
      label: string;
      valueHtml: string;
      suppressFirstSoundFilename: string | null;
    }> = pinnedBackSections.map((s) => {
      const contains = re.test(String(s.valueHtml ?? ""));
      const suppressFirstSoundFilename = !suppressed && contains ? filename : null;
      if (suppressFirstSoundFilename) suppressed = true;
      return { ...s, suppressFirstSoundFilename };
    });

    return { didSuppressPromotedBackSound: suppressed, sections };
  }, [pinnedBackSections, promotedSound?.filename, promotedSound?.source]);

  useEffect(() => {
    if (mode !== "review") return;
    if (currentId == null) return;
    const chosen = chosenAnswerStyleForCardIdRef.current;
    const effectiveStyle =
      chosen?.cardId === currentId ? chosen.style : reviewAnswerStyle;

    // Wait until state has caught up with the chosen style.
    if (effectiveStyle !== reviewAnswerStyle) return;
    if (effectiveStyle === "reverse") return;
    if (showAnswer) return;
    const filename = promotedSound?.filename;
    if (!filename) return;
    if (lastAutoPlayedCardAppearanceTokenRef.current === cardAppearanceToken) return;
    lastAutoPlayedCardAppearanceTokenRef.current = cardAppearanceToken;

    // Autoplay can be blocked by the browser; ignore failures.
    void (async () => {
      try {
        await tryPlayAudioFilename(activeNamespace, filename);
      } catch {
        // ignore
      }
    })();
  }, [mode, currentId, promotedSound?.filename, showAnswer, activeNamespace, reviewAnswerStyle, cardAppearanceToken]);

  useEffect(() => {
    if (mode !== "review") return;
    if (currentId == null) return;
    const chosen = chosenAnswerStyleForCardIdRef.current;
    const effectiveStyle =
      chosen?.cardId === currentId ? chosen.style : reviewAnswerStyle;

    // Wait until state has caught up with the chosen style.
    if (effectiveStyle !== reviewAnswerStyle) return;
    if (effectiveStyle !== "reverse") return;
    if (!showAnswer) return;
    const filename = promotedSound?.filename;
    if (!filename) return;
    if (lastReverseRevealAutoPlayedCardAppearanceTokenRef.current === cardAppearanceToken) return;
    lastReverseRevealAutoPlayedCardAppearanceTokenRef.current = cardAppearanceToken;

    // Autoplay can be blocked by the browser; ignore failures.
    void (async () => {
      try {
        await tryPlayAudioFilename(activeNamespace, filename);
      } catch {
        // ignore
      }
    })();
  }, [mode, currentId, promotedSound?.filename, showAnswer, activeNamespace, reviewAnswerStyle, cardAppearanceToken]);

  useEffect(() => {
    if (mode !== "review") {
      lastAutoPlayedCardAppearanceTokenRef.current = null;
      lastReverseRevealAutoPlayedCardAppearanceTokenRef.current = null;
      chosenAnswerStyleForCardIdRef.current = null;
    }
  }, [mode]);


  return (
    <div className="caliche-shell min-h-screen bg-background text-foreground">
      <div className="caliche-container mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:py-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="caliche-title text-3xl tracking-tight sm:text-4xl">
              Caliche Cards
            </h1>
            <p className="caliche-subtitle text-sm">
              Import an Anki .apkg and review with Fail/Pass.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {authUser ? (
              <>
                <div className="caliche-secondary-btn rounded-full px-3 py-2 text-xs text-foreground/70">
                  Signed in as {authUser.username}
                </div>

                {devPurgeEnabled ? (
                  <>
                    <button
                      type="button"
                      className="rounded-full border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/5"
                      onClick={onDevDebugLocalProgress}
                      disabled={busy}
                      title="DEV: show local progress counts"
                    >
                      Debug local
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/5"
                      onClick={onDevDebugCloudProgress}
                      disabled={busy}
                      title="DEV: show cloud progress counts"
                    >
                      Debug cloud
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-foreground/15 px-4 py-2 text-sm hover:bg-red-500/5 hover:border-red-500 hover:text-red-500"
                      onClick={onDevResetMyCloud}
                      disabled={busy || syncBusy}
                      title="DEV: delete ALL my cloud data (libraries, progress, media)"
                    >
                      Reset my cloud
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-foreground/15 px-4 py-2 text-sm hover:bg-red-500/5 hover:border-red-500 hover:text-red-500"
                      onClick={onDevPurgeOtherUsers}
                      disabled={busy || syncBusy}
                      title="DEV: delete cloud data for all OTHER users"
                    >
                      Purge others
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  className="caliche-secondary-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() => void onSyncFromCloud()}
                  disabled={syncBusy || busy}
                  title={syncProgress?.phase ?? "Sync decks and progress with the cloud"}
                >
                  {syncBusy
                    ? (syncProgress?.phase ?? "Syncing…")
                    : "Sync"}
                </button>

                <button
                  type="button"
                  className="caliche-secondary-btn rounded-full px-4 py-2 text-sm hover:bg-red-500/5 hover:border-red-500 hover:text-red-500"
                  onClick={onLogout}
                >
                  Logout
                </button>
              </>
            ) : authUser === null ? (
              <button
                type="button"
                className="caliche-secondary-btn rounded-full px-4 py-2 text-sm"
                onClick={() => {
                  window.location.href = "/login";
                }}
              >
                Log in
              </button>
            ) : (
              <div className="caliche-secondary-btn rounded-full px-3 py-2 text-xs text-foreground/70">
                Checking session…
              </div>
            )}

            {uiLibraries.length > 0 ? (
              <button
                type="button"
                className="caliche-secondary-btn rounded-full px-4 py-2 text-sm text-foreground/70 hover:text-foreground"
                onClick={onClearSaved}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="caliche-alert rounded-2xl px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}

        {mode === "import" ? (
          <main className="caliche-panel rounded-3xl p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Decks</div>
                <button
                  type="button"
                  className="caliche-primary-btn rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  Add deck
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".apkg,application/octet-stream"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    e.currentTarget.value = "";
                    void onPickFile(f);
                  }}
                />
              </div>

              {uiLibraries.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-foreground/70">
                    Import an <span className="font-medium">.apkg</span> to
                    see your decks here. They are saved locally so you can keep
                    using the app offline.
                  </p>
                  <button
                    type="button"
                    className="caliche-secondary-btn self-start rounded-full px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() => void onLoadDemoDecks()}
                    disabled={busy || syncBusy}
                  >
                    Load demo decks
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-foreground/15 bg-surface-strong/70">
                  <div className="hidden sm:grid grid-cols-[1fr_80px_90px_110px_90px_130px_80px_80px_48px] gap-2 border-b border-foreground/15 px-4 py-3 text-xs font-medium text-foreground/70">
                    <div>Deck</div>
                    <div className="text-center">New</div>
                    <div className="text-center">Learning</div>
                    <div className="text-center">Review</div>
                    <div className="text-center">Today</div>
                    <div className="text-center">Total</div>
                    <div className="text-center">Days left</div>
                    <div className="text-center">Days done</div>
                    <div />
                  </div>

                  <div className="divide-y divide-foreground/10">
                    {uiLibraries.flatMap((lib) => {
                      return lib.deck.decks.map((d) => {
                        const depth = Math.max(
                          0,
                          d.name.split("::").length - 1
                        );
                        const display =
                          d.name.split("::").slice(-1)[0] ?? d.name;
                        const overview = deckOverviews[`${lib.id}:${d.id}`] ?? null;
                        const isSelected =
                          (activeLibrary?.id ?? null) === lib.id &&
                          (lib.selectedDeckId ?? null) === d.id;

                        const menuOpen =
                          openDeckMenu?.libraryId === lib.id &&
                          openDeckMenu.deckId === d.id;

                        const isEditing =
                          editingDeck?.libraryId === lib.id &&
                          editingDeck.deckId === d.id;


                        return (
                          <div
                            key={`${lib.id}:${d.id}`}
                            className={`grid grid-cols-[1fr_48px] sm:grid-cols-[1fr_80px_90px_110px_90px_130px_80px_80px_48px] items-center gap-2 rounded-xl px-2 py-2 ${
                              isSelected
                                ? "bg-foreground/5"
                                : "hover:bg-foreground/5"
                            }`}
                          >
                            <button
                              type="button"
                              className={`min-w-0 text-left ${syncBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                              onClick={() => startReviewFor(lib.id, d.id)}
                              disabled={syncBusy}
                              aria-disabled={syncBusy}
                              title={syncBusy ? "Syncing…" : "Open deck"}
                            >
                              <div
                                className="truncate text-sm font-medium"
                                style={{ paddingLeft: depth * 14 }}
                              >
                                {isEditing ? (
                                  <input
                                    value={editingDeck.value}
                                    onChange={(e) =>
                                      setEditingDeck({
                                        libraryId: lib.id,
                                        deckId: d.id,
                                        value: e.target.value,
                                      })
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        renameDeck(
                                          lib.id,
                                          d.id,
                                          editingDeck.value
                                        );
                                        setEditingDeck(null);
                                      }
                                      if (e.key === "Escape") {
                                        setEditingDeck(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      renameDeck(
                                        lib.id,
                                        d.id,
                                        editingDeck.value
                                      );
                                      setEditingDeck(null);
                                    }}
                                    className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
                                    autoFocus
                                  />
                                ) : (
                                  display
                                )}
                              </div>
                            </button>

                            <div className="hidden sm:block text-center text-sm text-blue-400">
                              {overview ? overview.newShown : 0}
                            </div>
                            <div className="hidden sm:block text-center text-sm text-foreground/70">
                              {overview ? overview.learningDue : 0}
                            </div>
                            <div className="hidden sm:block text-center text-sm font-medium text-green-500">
                              {overview ? overview.reviewShown : 0}
                            </div>
                            <div className="hidden sm:block text-center text-sm font-semibold text-foreground">
                              {overview
                                ? overview.newShown + overview.reviewShown + overview.learningDue
                                : "—"}
                            </div>
                            <div className="hidden sm:block text-center text-sm text-foreground/70">
                              {overview
                                ? `${overview.reviewed}/${overview.total}`
                                : "—"}
                            </div>
                            <div className="hidden sm:block text-center text-sm text-foreground/70">
                              {overview
                                ? (() => {
                                    const unseen = overview.total - overview.reviewed;
                                    if (unseen <= 0) return "✓";
                                    const rate = overview.config.newPerDay;
                                    if (!rate) return "—";
                                    return String(Math.ceil(unseen / rate));
                                  })()
                                : "—"}
                            </div>
                            <div className="hidden sm:block text-center text-sm text-foreground/70">
                              {overview ? overview.daysStudied || "—" : "—"}
                            </div>

                            <div
                              className="relative flex justify-end"
                              data-deck-menu-root="true"
                            >
                              <button
                                type="button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5 cursor-pointer"
                                aria-label="Settings"
                                title="Settings"
                                onClick={() => {
                                  if (menuOpen) {
                                    setOpenDeckMenu(null);
                                    return;
                                  }
                                  setOpenDeckMenu({ libraryId: lib.id, deckId: d.id });
                                }}
                              >
                                <FaCog className="h-4 w-4" aria-hidden="true" />
                              </button>

                              {menuOpen ? (
                                <div className="absolute right-0 top-12 z-10 w-56 rounded-xl border border-foreground/15 bg-background p-1 shadow-sm">
                                  <button
                                    type="button"
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-foreground/5"
                                    onClick={() => {
                                      setOpenDeckMenu(null);
                                      setEditingDeck({
                                        libraryId: lib.id,
                                        deckId: d.id,
                                        value: d.name,
                                      });
                                    }}
                                  >
                                    Rename
                                  </button>

                                  <button
                                    type="button"
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-foreground/5"
                                    onClick={() => {
                                      setLimitsModal({
                                        libraryId: lib.id,
                                        deckId: d.id,
                                        newPerDay: String(overview?.config.newPerDay ?? 10),
                                        reviewsPerDay: String(overview?.config.reviewsPerDay ?? 200),
                                      });
                                      setOpenDeckMenu(null);
                                    }}
                                  >
                                    Edit limits
                                  </button>

                                  

                                  <button
                                    type="button"
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-foreground/5"
                                    onClick={() => {
                                      const current = (overview?.config.answerStyles ?? [
                                        "normal", "write", "multiple-choice", "reverse", "match",
                                      ]) as ReviewAnswerStyle[];
                                      setCardTypesModal({ libraryId: lib.id, deckId: d.id, styles: current });
                                      setOpenDeckMenu(null);
                                    }}
                                  >
                                    Edit type of cards
                                  </button>
                                  <div className="px-3 py-2">
                                    <label className="flex items-center justify-between gap-3 text-xs text-foreground/70">
                                      <span>Card info open</span>
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={Boolean(overview?.config.cardInfoOpenByDefault)}
                                        onChange={(e) => {
                                          void commitCardInfoDefaultOpen(
                                            lib.id,
                                            d.id,
                                            e.currentTarget.checked
                                          );
                                        }}
                                      />
                                    </label>
                                  </div>
                                  
                                  <div className="px-3 py-2">
                                    <div className="text-xs text-foreground/70">Write language</div>
                                    <select
                                      className="mt-1 w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
                                      value={
                                        overview?.config.writeLanguage ??
                                        DEFAULT_DECK_CONFIG.writeLanguage
                                      }
                                      onChange={(e) => {
                                        const next = sanitizeWriteLanguage(e.currentTarget.value);
                                        void commitDeckWriteLanguage(lib.id, d.id, next);
                                      }}
                                    >
                                      <option value="en">English</option>
                                      <option value="fr">Français</option>
                                      <option value="es">Español</option>
                                    </select>
                                  </div>

                                  <button
                                    type="button"
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-foreground/5"
                                    onClick={() => {
                                      setOpenDeckMenu(null);
                                      void getDeckFieldNames(lib.id, d.id).then((allFields) => {
                                        setFieldConfigModal({
                                          type: "hidden",
                                          libraryId: lib.id,
                                          deckId: d.id,
                                          allFields,
                                          current: overview?.config.hiddenFieldLabels ?? [],
                                        });
                                      });
                                    }}
                                  >
                                    Hidden fields
                                  </button>

                                  <button
                                    type="button"
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-foreground/5"
                                    onClick={() => {
                                      setOpenDeckMenu(null);
                                      void getDeckFieldNames(lib.id, d.id).then((allFields) => {
                                        setFieldConfigModal({
                                          type: "pinned",
                                          libraryId: lib.id,
                                          deckId: d.id,
                                          allFields,
                                          current: overview?.config.pinnedBackFieldLabels ?? [],
                                        });
                                      });
                                    }}
                                  >
                                    Pinned back fields
                                  </button>

                                  <button
                                    type="button"
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-foreground/5"
                                    onClick={() => {
                                      setOpenDeckMenu(null);
                                      void onResetDeckProgress({
                                        libraryId: lib.id,
                                        deckId: d.id,
                                        deckName: d.name,
                                      });
                                    }}
                                    disabled={busy}
                                  >
                                    Reset progress
                                  </button>

                                  <button
                                    type="button"
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-foreground/5"
                                    onClick={() => {
                                      setOpenDeckMenu(null);
                                      const ok = confirm(
                                        `Delete “${d.name}” and its subdecks?`
                                      );
                                      if (!ok) return;
                                      void deleteDeck(lib.id, d.id);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div className="col-span-2 sm:hidden pb-1 text-xs text-foreground/70">
                              <span className="text-blue-400">New {overview ? overview.newShown : 0}</span>
                              <span> • </span>
                              <span>Learning {overview ? overview.learningDue : 0}</span>
                              <span> • </span>
                              <span className="text-green-500">Review {overview ? overview.reviewShown : 0}</span>
                              <span> • </span>
                              <span>
                                Total {overview ? `${overview.reviewed}/${overview.total}` : "—"}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })}
                  </div>
                </div>
              )}
            </div>
          </main>
        ) : null}

        {mode === "review" ? (
          <main className="caliche-panel rounded-3xl p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              {currentMissingFields ? (
                <div className="caliche-alert rounded-2xl px-4 py-3 text-sm">
                  This deck was saved with an older version and is missing some
                  fields. Click <span className="font-medium">Clear all</span>{" "}
                  and re-import the <span className="font-medium">.apkg</span>.
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-foreground/70">Deck</div>
                  <div className="text-sm font-medium">
                    {selectedDeckName ?? "(unnamed)"}
                  </div>
                  <div className="mt-1 text-xs text-foreground/70">
                    New/day: {reviewOverview?.config.newPerDay ?? "—"} • Review/day: {reviewOverview?.config.reviewsPerDay ?? "—"}
                    {reviewOverview
                      ? ` • Words: ${reviewOverview.reviewed}/${reviewOverview.total}`
                      : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                     <button
                      type="button"
                      onClick={() => setShowCountersInfo(true)}
                      aria-label="What do these numbers mean?"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-foreground/30 text-xs text-foreground/50 hover:border-foreground/60 hover:text-foreground/80"
                    >
                      i
                    </button>
                    <div className="text-sm text-foreground/70">
                      Due:{" "}
                      {reviewOverview
                        ? reviewOverview.learningDue + reviewOverview.reviewShown
                        : 0}
                      {reviewOverview ? (
                        <>
                          {" "}• New: {reviewOverview.newShown}
                          {" "}• Learning: {reviewOverview.learningDue}
                          {" "}• Review: {reviewOverview.reviewShown}
                        </>
                      ) : null}
                      {reviewOverview && reviewOverview.learningWaiting > 0 ? (
                        <> {" "}• Waiting: {reviewOverview.learningWaiting}</>
                      ) : null}
                    </div>
                    
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("import");
                      setShowAnswer(false);
                      setReviewRef(null);
                      setCurrent(null);
                      setReviewOverview(null);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5"
                    title="Exit"
                    aria-label="Exit"
                  >
                    <FaTimes className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Answer style is randomized per card (from enabled styles). */}

              {current ? (
                <div className="relative overflow-hidden rounded-3xl border border-foreground/15 bg-surface-strong/70 p-6 shadow-[0_18px_50px_-30px_rgba(6,18,33,0.55)]">
                  {currentTimingTag ? (
                    <div className="absolute left-4 top-4 text-xs text-foreground/60">
                      <span
                        className={`font-semibold ${
                          currentTimingTag.kind === "new"
                            ? "text-blue-400"
                            : currentTimingTag.kind === "due"
                              ? "text-yellow-500"
                              : "text-foreground"
                        }`}
                      >
                        {currentTimingTag.label}
                      </span>
                      {currentTimingTag.detail ? (
                        <span className="text-foreground/60"> {currentTimingTag.detail}</span>
                      ) : null}
                    </div>
                  ) : null}

                  {promotedSound?.filename ? (
                    <div className="absolute right-4 top-4">
                      <SoundButton
                        namespace={activeNamespace}
                        filename={promotedSound.filename}
                        variant="icon"
                        disabled={isReverseAudioLocked}
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-6">
                    {reviewAnswerStyle === "write" && !showAnswer ? (
                      <div className="py-6">
                        <div className="text-center text-sm text-foreground/70">
                          Click (or Tab to) the letters to write the word
                        </div>
                        {!writeIsAvailable ? (
                          <div className="mt-3 text-center text-sm text-foreground/70">
                            Write mode isn’t available for this card.
                          </div>
                        ) : (
                          <>
                            <div className="mt-4 flex justify-center">
                              <div
                                className={`min-h-14 rounded-2xl border bg-background px-5 py-3 text-center text-3xl font-semibold tracking-widest ${
                                  writeOutcome == null
                                    ? "border-foreground/15"
                                    : writeOutcome === "correct"
                                      ? "border-green-500 bg-green-500/5"
                                      : "border-red-500 bg-red-500/5"
                                }`}
                              >
                                {writePicked.length > 0 ? (
                                  <div
                                    className="flex flex-wrap justify-center gap-2"
                                    style={{ touchAction: "none" }}
                                  >
                                    {writePicked.map((p, pickedIdx) => {
                                      const isDragging = writeDrag?.fromIdx === pickedIdx;
                                      const showDropBefore =
                                        writeDrag !== null &&
                                        writeDrag.dropIdx === pickedIdx &&
                                        !isDragging &&
                                        writeDrag.dropIdx !== writeDrag.fromIdx + 1;
                                      return (
                                        <span key={`picked-${currentId ?? ""}-${pickedIdx}-${p.index}-${p.ch}`} className="flex items-center">
                                          {showDropBefore && (
                                            <span className="mr-1 h-10 w-1 rounded-full bg-blue-500 sm:h-12" />
                                          )}
                                          <button
                                            ref={(el) => { writePickedRefs.current[pickedIdx] = el; }}
                                            type="button"
                                            disabled={reviewBusy || writeOutcome != null}
                                            onPointerDown={(e) => {
                                              if (reviewBusy || writeOutcome != null) return;
                                              e.preventDefault();
                                              const state = { fromIdx: pickedIdx, ch: p.ch, x: e.clientX, y: e.clientY, dropIdx: pickedIdx };
                                              writeDragRef.current = state;
                                              setWriteDrag(state);
                                            }}
                                            aria-label={p.ch === " " ? "space" : p.ch}
                                            className={`inline-flex h-10 min-w-10 cursor-grab items-center justify-center rounded-2xl border px-2 text-lg transition-opacity active:cursor-grabbing disabled:opacity-60 sm:h-12 sm:min-w-12 sm:px-3 sm:text-2xl ${
                                              writeOutcome != null
                                                ? writeOutcome === "correct"
                                                  ? "border-green-500 bg-green-500/10 text-green-500"
                                                  : "border-red-500 bg-red-500/10 text-red-500"
                                                : isDragging
                                                  ? "border-blue-500 bg-blue-500/10 opacity-40"
                                                  : "border-foreground/15 bg-foreground/5"
                                            }`}
                                          >
                                            {p.ch === " " ? "␣" : p.ch}
                                          </button>
                                        </span>
                                      );
                                    })}
                                    {writeDrag !== null &&
                                      writeDrag.dropIdx === writePicked.length &&
                                      writeDrag.dropIdx !== writeDrag.fromIdx &&
                                      writeDrag.dropIdx !== writeDrag.fromIdx + 1 && (
                                        <span className="flex items-center">
                                          <span className="h-10 w-1 rounded-full bg-blue-500 sm:h-12" />
                                        </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-foreground/30">…</span>
                                )}
                              </div>
                            </div>

                            {writeDrag !== null && (
                              <div
                                style={{
                                  position: "fixed",
                                  left: writeDrag.x - 24,
                                  top: writeDrag.y - 24,
                                  zIndex: 9999,
                                  pointerEvents: "none",
                                }}
                                className="flex h-12 min-w-12 items-center justify-center rounded-2xl border-2 border-blue-500 bg-blue-500/20 px-2 text-lg font-semibold text-blue-500 shadow-lg"
                              >
                                {writeDrag.ch === " " ? "␣" : writeDrag.ch}
                              </div>
                            )}

                            {writePicked.length > 0 && writeOutcome == null && (
                              <div className="mt-2 flex justify-center">
                                <button
                                  type="button"
                                  className="rounded-full border border-foreground/20 px-4 py-1 text-xs font-medium text-foreground/50 hover:bg-foreground/5 disabled:opacity-50"
                                  disabled={reviewBusy}
                                  onClick={() => {
                                    writeDragRef.current = null;
                                    setWriteDrag(null);
                                    setWritePicked([]);
                                  }}
                                >
                                  Clear
                                </button>
                              </div>
                            )}

                            <div className="mt-4 flex flex-wrap justify-center gap-2">
                              {writeBank.map((ch, idx) => {
                                const used = writeUsed.has(idx);
                                return (
                                  <button
                                    key={`write-${currentId ?? ""}-${idx}-${ch}`}
                                    type="button"
                                    disabled={reviewBusy || used || writeOutcome != null}
                                    onClick={() => {
                                      if (reviewBusy) return;
                                      if (used) return;
                                      if (writeOutcome != null) return;
                                      setWritePicked((prev) => [...prev, { index: idx, ch }]);
                                    }}
                                    className={`h-12 w-12 rounded-2xl border border-foreground/15 text-lg font-semibold hover:bg-foreground/5 disabled:opacity-40 ${
                                      used ? "bg-foreground/5" : "bg-background"
                                    }`}
                                  >
                                    {ch === " " ? "␣" : ch}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="mt-5 flex justify-center">
                              <button
                                type="button"
                                className="caliche-primary-btn h-11 rounded-full px-8 text-sm font-medium disabled:opacity-50"
                                disabled={
                                  reviewBusy ||
                                  !writeIsAvailable ||
                                  writePicked.length === 0 ||
                                  writeOutcome != null
                                }
                                onClick={() => {
                                  if (!writeIsAvailable) return;
                                  if (writePicked.length === 0) return;
                                  if (writeOutcome != null) return;
                                  writeDragRef.current = null;
                                  setWriteDrag(null);
                                  const expected = writeExpectedChars.join("");
                                  const answer = writePicked.map((p) => p.ch).join("");
                                  const ok =
                                    answer.normalize("NFKC").toLowerCase() ===
                                    expected.normalize("NFKC").toLowerCase();
                                  setWriteOutcome(ok ? "correct" : "wrong");
                                }}
                              >
                                Submit
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : reviewAnswerStyle === "reverse" && !showAnswer ? (
                      <div className="py-10">
                        <CardFace
                          namespace={activeNamespace}
                          html={reversePromptHtml ?? current.card.backHtml}
                          suppressFirstSoundFilename={
                            promotedSound?.source === "back"
                              ? promotedSound.filename
                              : null
                          }
                          soundDisabled={isReverseAudioLocked}
                          className="text-center text-xl leading-8"
                        />
                      </div>
                    ) : reviewAnswerStyle === "match" && !showAnswer ? null : (
                      <div className="py-10">
                        <CardFace
                          namespace={activeNamespace}
                          html={current.card.frontHtml}
                          suppressFirstSoundFilename={
                            promotedSound?.source === "front"
                              ? promotedSound.filename
                              : null
                          }
                          className="text-center text-4xl font-semibold leading-tight tracking-tight"
                        />
                      </div>
                    )}

                    {reviewAnswerStyle === "multiple-choice" && !showAnswer ? (
                      <div className="pb-2">
                        <div className="text-center text-sm text-foreground/70">
                          Choose the correct answer
                        </div>
                        {!mcCanRun ? (
                          <div className="mt-3 text-center text-sm text-foreground/70">
                            Multiple-choice isn’t available for this card.
                          </div>
                        ) : (
                          <>
                            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {mcOptions.map((opt, idx) => (
                                <button
                                  key={`mc-${currentId ?? ""}-${idx}-${opt.label}`}
                                  type="button"
                                  disabled={reviewBusy || mcOutcome != null}
                                  onClick={() => {
                                    if (reviewBusy || mcOutcome != null) return;
                                    setMcSelectedIndex(idx);
                                  }}
                                  className={`min-h-12 rounded-2xl border bg-background px-4 py-3 text-left text-base font-medium disabled:opacity-80 ${
                                    mcOutcome == null
                                      ? mcSelectedIndex === idx
                                        ? "border-foreground/60 bg-foreground/5"
                                        : "border-foreground/15 hover:bg-foreground/5"
                                      : opt.isCorrect
                                        ? "border-green-500 bg-green-500/5"
                                        : mcSelectedIndex === idx
                                          ? "border-red-500 bg-red-500/5"
                                          : "border-foreground/10 opacity-60"
                                  }`}
                                >
                                  <span className="mr-2 text-foreground/60">
                                    {String.fromCharCode(65 + (idx % 26))}.
                                  </span>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            {mcSelectedIndex !== null && mcOutcome === null && (
                              <div className="mt-4 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const selected = mcOptions[mcSelectedIndex];
                                    if (!selected) return;
                                    setMcOutcome(selected.isCorrect ? "correct" : "wrong");
                                  }}
                                  className="caliche-primary-btn h-11 rounded-full px-8 text-sm font-medium"
                                >
                                  Submit
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : null}

                    {reviewAnswerStyle === "reverse" && !showAnswer ? (
                      <div className="pb-2">
                        <div className="text-center text-sm text-foreground/70">
                          Choose the correct front
                        </div>
                        {!reverseCanRun ? (
                          <div className="mt-3 text-center text-sm text-foreground/70">
                            Reverse mode isn’t available for this card.
                          </div>
                        ) : (
                          <>
                            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {reverseOptions.map((opt, idx) => (
                                <button
                                  key={`rev-${currentId ?? ""}-${idx}-${opt.label}`}
                                  type="button"
                                  disabled={reviewBusy || reverseOutcome != null}
                                  onClick={() => {
                                    if (reviewBusy || reverseOutcome != null) return;
                                    setReverseSelectedIndex(idx);
                                  }}
                                  className={`min-h-12 rounded-2xl border bg-background px-4 py-3 text-left text-base font-medium disabled:opacity-80 ${
                                    reverseOutcome == null
                                      ? reverseSelectedIndex === idx
                                        ? "border-foreground/60 bg-foreground/5"
                                        : "border-foreground/15 hover:bg-foreground/5"
                                      : opt.isCorrect
                                        ? "border-green-500 bg-green-500/5"
                                        : reverseSelectedIndex === idx
                                          ? "border-red-500 bg-red-500/5"
                                          : "border-foreground/10 opacity-60"
                                  }`}
                                >
                                  <span className="mr-2 text-foreground/60">
                                    {String.fromCharCode(65 + (idx % 26))}.
                                  </span>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            {reverseSelectedIndex !== null && reverseOutcome === null && (
                              <div className="mt-4 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const selected = reverseOptions[reverseSelectedIndex];
                                    if (!selected) return;
                                    setReverseOutcome(selected.isCorrect ? "correct" : "wrong");
                                  }}
                                  className="caliche-primary-btn h-11 rounded-full px-8 text-sm font-medium"
                                >
                                  Submit
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : null}

                    {reviewAnswerStyle === "match" && !showAnswer ? (
                      <div className="flex flex-col gap-6 pt-6 pb-2">
                        {matchItems.length < 2 ? (
                          <div className="text-center text-sm text-foreground/70">
                            Match is not available for this card.
                          </div>
                        ) : (
                          <>
                            {/* Word slots — top */}
                            <div>
                              <div className="mb-3 flex items-center justify-between px-1 pt-4">
                                <span className="text-xs font-semibold uppercase tracking-widest text-foreground/40">Words</span>
                                <span className="rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs font-medium text-foreground/50">{matchItems.length} cards</span>
                              </div>
                              <div className={`grid gap-3 grid-cols-${matchItems.length}`}>
                                {matchItems.map((item, slot) => {
                                  const assignedBottomIdx = matchAssigned[slot] ?? null;
                                  const assignedItem =
                                    assignedBottomIdx !== null
                                      ? matchItems[matchRightOrder[assignedBottomIdx] ?? -1] ?? null
                                      : null;
                                  const isCorrect =
                                    matchSubmitted &&
                                    assignedBottomIdx !== null &&
                                    matchRightOrder[assignedBottomIdx] === slot;
                                  const isWrong =
                                    matchSubmitted &&
                                    assignedBottomIdx !== null &&
                                    matchRightOrder[assignedBottomIdx] !== slot;
                                  return (
                                    <div key={`slot-${slot}`} className="flex flex-col gap-1.5">
                                      <button
                                        type="button"
                                        disabled={!matchSubmitted}
                                        onClick={() => {
                                          if (!matchSubmitted || !reviewRef) return;
                                          const db = getStudyDb();
                                          void db.cards.get([reviewRef.libraryId, item.cardId]).then((card) => {
                                            if (card) setMatchCardPreview({ item, card });
                                          });
                                        }}
                                        className={`rounded-xl bg-foreground/8 px-2 py-2.5 text-center text-sm font-semibold leading-tight w-full ${matchSubmitted ? "cursor-pointer hover:bg-foreground/15 transition-colors" : ""}`}
                                      >
                                        {item.front}
                                        {item.soundFile ? <span className="ml-1 text-foreground/40 text-xs">♪</span> : null}
                                        {matchSubmitted && <span className="ml-1 text-foreground/30 text-xs">↗</span>}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={matchSubmitted}
                                        onClick={() => {
                                          if (matchSubmitted) return;
                                          if (assignedBottomIdx !== null) {
                                            setMatchAssigned((prev) => {
                                              const next = [...prev];
                                              next[slot] = null;
                                              return next;
                                            });
                                          }
                                        }}
                                        className={`min-h-10 rounded-xl border-2 px-2 py-2 text-center text-xs transition-colors ${
                                          isCorrect
                                            ? "border-green-500 bg-green-500/10 text-green-600"
                                            : isWrong
                                              ? "border-red-500 bg-red-500/10 text-red-500"
                                              : assignedItem
                                                ? "border-blue-400/60 bg-blue-400/8 text-foreground hover:bg-red-500/8 hover:border-red-400"
                                                : "border-dashed border-foreground/20 text-foreground/25"
                                        }`}
                                      >
                                        {assignedItem ? assignedItem.back : "·  ·  ·"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Answer chips — bottom */}
                            <div>
                              <div className="mb-3 flex items-center justify-between px-1">
                                <span className="text-xs font-semibold uppercase tracking-widest text-foreground/40">Answers</span>
                                {/* Single play button: reproduces audio of the NEXT word to answer */}
                                {matchItems.some((item) => item.soundFile) ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const firstEmpty = matchAssigned.findIndex((v) => v === null);
                                      const idx = firstEmpty !== -1 ? firstEmpty : matchItems.length - 1;
                                      const word = matchItems[idx];
                                      if (word?.soundFile) {
                                        void tryPlayAudioFilename(activeNamespace, word.soundFile).catch(() => {});
                                      }
                                    }}
                                    className="flex h-6 w-6 items-center justify-center rounded-full border border-foreground/20 text-foreground/50 hover:bg-foreground/8 hover:text-foreground/80 transition-colors"
                                    aria-label="Play current word audio"
                                  >
                                    <FaPlay className="h-2.5 w-2.5" />
                                  </button>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2 justify-center">
                              {matchRightOrder.map((itemIdx, bottomIdx) => {
                                const item = matchItems[itemIdx];
                                if (!item) return null;
                                const isUsed = matchAssigned.includes(bottomIdx);
                                return (
                                  <button
                                    key={`ans-${bottomIdx}-${item.cardId}`}
                                    type="button"
                                    disabled={matchSubmitted}
                                    onClick={() => {
                                      if (matchSubmitted) return;
                                      if (isUsed) {
                                        setMatchAssigned((prev) =>
                                          prev.map((v) => (v === bottomIdx ? null : v))
                                        );
                                        return;
                                      }
                                      // Play the audio of the WORD SLOT being filled
                                      const firstEmpty = matchAssigned.findIndex((v) => v === null);
                                      if (firstEmpty !== -1) {
                                        const wordAtSlot = matchItems[firstEmpty];
                                        if (wordAtSlot?.soundFile) {
                                          void tryPlayAudioFilename(activeNamespace, wordAtSlot.soundFile).catch(() => {});
                                        }
                                      }
                                      setMatchAssigned((prev) => {
                                        const next = [...prev];
                                        const emptyIdx = next.findIndex((v) => v === null);
                                        if (emptyIdx !== -1) next[emptyIdx] = bottomIdx;
                                        return next;
                                      });
                                    }}
                                    className={`rounded-2xl border px-4 py-2 text-sm font-medium transition-colors ${
                                      isUsed
                                        ? "border-foreground/10 bg-foreground/5 text-foreground/30"
                                        : "border-foreground/20 bg-background hover:bg-foreground/5 active:bg-foreground/10"
                                    }`}
                                  >
                                    {item.back}
                                  </button>
                                );
                              })}
                              </div>
                            </div>

                            {/* Submit */}
                            {!matchSubmitted ? (
                              <button
                                type="button"
                                disabled={matchAssigned.some((v) => v === null)}
                                onClick={() => {
                                  setMatchSubmitted(true);
                                  const perSlot = matchItems.map((_, slot) => {
                                    const assigned = matchAssigned[slot];
                                    if (assigned === null) return false;
                                    return matchRightOrder[assigned] === slot;
                                  });
                                  setMatchCardResults(perSlot);
                                  setMatchOutcome(perSlot.every(Boolean) ? "correct" : "wrong");
                                }}
                                className="caliche-primary-btn h-11 rounded-full px-6 text-sm font-medium disabled:opacity-40 self-center"
                              >
                                Submit
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={reviewBusy}
                                onClick={() => void onAnswer(matchOutcome === "correct" ? "pass" : "fail")}
                                className="caliche-primary-btn h-11 rounded-full px-6 text-sm font-medium self-center"
                              >
                                Continue
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    ) : null}

                    {showAnswer ? (
                      <div className="border-t border-foreground/15 pt-6">
                        <>
                          {pinnedBackSections.length > 0 ? (
                            <div className="mb-6 flex flex-col gap-4">
                              {pinnedBackRender.sections.map((sec) => (
                                <div key={`pinned-${sec.index}-${sec.label}`}>
                                  <div className="mb-1 text-xs text-center font-medium text-foreground/60">
                                    {sec.label}:
                                  </div>
                                  <CardFace
                                    namespace={activeNamespace}
                                    html={sec.valueHtml}
                                    suppressFirstSoundFilename={sec.suppressFirstSoundFilename}
                                    className="text-center text-xl leading-8"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {answerFieldSectionsWithoutPinned.length > 0 ? (
                            <div className="flex flex-col gap-4">
                              {answerFieldSectionsWithoutPinned.map((sec, idx) => (
                                <div key={`${sec.index}-${sec.label}`}>
                                  <div className="mb-1 text-xs text-center font-medium text-foreground/60">
                                    {sec.label}:
                                  </div>
                                  <CardFace
                                    namespace={activeNamespace}
                                    html={sec.valueHtml}
                                    suppressFirstSoundFilename={
                                      idx === 0 &&
                                      !pinnedBackRender.didSuppressPromotedBackSound &&
                                      promotedSound?.source === "back"
                                        ? promotedSound.filename
                                        : null
                                    }
                                    className="text-center text-xl leading-8"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <>
                              {answerFieldLabelsWithoutPinned.length > 0 ? (
                                <div className="mb-3 text-xs font-medium text-foreground/60">
                                  {answerFieldLabelsWithoutPinned.join(" • ")}
                                </div>
                              ) : null}
                              {pinnedBackSections.length === 0 ? (
                                <CardFace
                                  namespace={activeNamespace}
                                  html={current.card.backHtml}
                                  suppressFirstSoundFilename={
                                    !pinnedBackRender.didSuppressPromotedBackSound &&
                                    promotedSound?.source === "back"
                                      ? promotedSound.filename
                                      : null
                                  }
                                  className="text-center text-xl leading-8"
                                />
                              ) : null}
                            </>
                          )}
                        </>
                      </div>
                    ) : null}

                    {showAnswer ? (
                      <FieldsList
                        key={`${activeNamespace}:${reviewRef?.deckId ?? current.card.deckId}`}
                        namespace={activeNamespace}
                        fields={current.card.fieldsHtml}
                        names={current.card.fieldNames}
                        defaultOpen={Boolean(reviewDeckConfig?.cardInfoOpenByDefault)}
                        hiddenNorm={activeHiddenNorm}
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="caliche-alert rounded-2xl px-4 py-6 text-center">
                  <div className="text-lg font-semibold">All done for today!</div>
                  <div className="mt-1 text-sm text-foreground/70">
                    {reviewOverview?.nextAvailableTs != null || reviewOverview?.nextDueTs != null ? (
                      (() => {
                        const nextTs = reviewOverview?.nextAvailableTs ?? reviewOverview?.nextDueTs ?? nowTs;
                        const inLabel = formatIn(nextTs, nowTs);
                        const atLabel = new Date(nextTs).toLocaleTimeString();
                        const waiting = reviewOverview.learningWaiting;
                        return (
                          <>
                            Next card in <span className="font-medium">{inLabel}</span>
                            <span className="text-foreground/60"> (at {atLabel})</span>
                            {waiting > 0 ? (
                              <>
                                {" "}• Waiting: <span className="font-medium">{waiting}</span>
                              </>
                            ) : null}
                          </>
                        );
                      })()
                    ) : (
                      <>No more cards ready (or you hit today’s limits).</>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                {current ? (
                  !showAnswer ? (
                    reviewAnswerStyle === "normal" ||
                    (reviewAnswerStyle === "write" && !writeIsAvailable) ||
                    (reviewAnswerStyle === "multiple-choice" && !mcCanRun) ||
                    (reviewAnswerStyle === "reverse" && !reverseCanRun) ||
                    (reviewAnswerStyle === "match" && matchItems.length < 2) ||
                    (reviewAnswerStyle === "write" && writeOutcome != null) ||
                    (reviewAnswerStyle === "multiple-choice" && mcOutcome != null) ||
                    (reviewAnswerStyle === "reverse" && reverseOutcome != null) ? (
                      <button
                        type="button"
                        className="caliche-primary-btn h-12 flex-1 rounded-full px-5 text-sm font-medium"
                        onClick={() => setShowAnswer(true)}
                        disabled={reviewBusy}
                      >
                        {(reviewAnswerStyle === "write" && writeOutcome != null) ||
                        (reviewAnswerStyle === "multiple-choice" && mcOutcome != null) ||
                        (reviewAnswerStyle === "reverse" && reverseOutcome != null)
                          ? "Reveal answer"
                          : "Show answer"}
                      </button>
                    ) : null
                  ) : (
                    <>
                      <button
                        type="button"
                        className="h-12 flex-1 rounded-full border border-red-500 px-5 text-sm font-medium text-red-500 hover:bg-red-500 hover:text-background disabled:pointer-events-none disabled:border-foreground/20 disabled:bg-foreground/5 disabled:text-foreground/40"
                        onClick={() => void onAnswer("fail")}
                        disabled={
                          reviewBusy ||
                          (reviewAnswerStyle === "multiple-choice" && mcOutcome === "correct") ||
                          (reviewAnswerStyle === "reverse" && reverseOutcome === "correct")
                        }
                      >
                        Fail{nextDueLabels ? ` • ${nextDueLabels.fail}` : ""}
                      </button>
                      <button
                        type="button"
                        className="h-12 flex-1 rounded-full border border-green-500 px-5 text-sm font-medium text-green-500 hover:bg-green-500 hover:text-background disabled:pointer-events-none disabled:border-foreground/20 disabled:bg-foreground/5 disabled:text-foreground/40"
                        onClick={() => void onAnswer("pass")}
                        disabled={
                          reviewBusy ||
                          (reviewAnswerStyle === "write" && writeOutcome === "wrong") ||
                          (reviewAnswerStyle === "multiple-choice" && mcOutcome === "wrong") ||
                          (reviewAnswerStyle === "reverse" && reverseOutcome === "wrong")
                        }
                      >
                        Pass{nextDueLabels ? ` • ${nextDueLabels.pass}` : ""}
                      </button>
                    </>
                  )
                ) : (
                  <button
                    type="button"
                    className="caliche-primary-btn h-12 flex-1 rounded-full px-5 text-sm font-medium"
                    onClick={() => {
                      setMode("import");
                      setShowAnswer(false);
                      setReviewRef(null);
                      setCurrent(null);
                      setReviewOverview(null);
                    }}
                  >
                    Back
                  </button>
                )}
              </div>
            </div>
          </main>
        ) : null}
      </div>

      {cardTypesModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setCardTypesModal(null); }}
        >
          <div className="w-full max-w-xs rounded-2xl bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Type of cards</h2>
              <button
                type="button"
                onClick={() => setCardTypesModal(null)}
                className="rounded-full p-1 text-foreground/50 hover:bg-foreground/10"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {(cardTypesModal.styles.length < 5 || cardTypesModal.styles.length > 1) && (
              <div className="mb-3 flex gap-2">
                {cardTypesModal.styles.length < 5 && (
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-foreground/15 py-1.5 text-xs hover:bg-foreground/5"
                    onClick={() => setCardTypesModal((m) => m ? { ...m, styles: ["normal", "write", "multiple-choice", "reverse", "match"] } : m)}
                  >
                    Select all
                  </button>
                )}
                {cardTypesModal.styles.length > 1 && (
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-foreground/15 py-1.5 text-xs hover:bg-foreground/5"
                    onClick={() => setCardTypesModal((m) => m ? { ...m, styles: ["normal"] } : m)}
                  >
                    Deselect all
                  </button>
                )}
              </div>
            )}
            <div className="space-y-3">
              {(
                [
                  { id: "normal" as const, label: "Normal" },
                  { id: "write" as const, label: "Write" },
                  { id: "multiple-choice" as const, label: "Multiple-choice" },
                  { id: "reverse" as const, label: "Reverse" },
                  { id: "match" as const, label: "Match" },
                ] satisfies Array<{ id: ReviewAnswerStyle; label: string }>
              ).map((opt) => {
                const checked = cardTypesModal.styles.includes(opt.id);
                return (
                  <label key={opt.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{opt.label}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={(e) => {
                        const wants = e.currentTarget.checked;
                        setCardTypesModal((m) => {
                          if (!m) return m;
                          const base = new Set<ReviewAnswerStyle>(m.styles);
                          if (wants) base.add(opt.id);
                          else base.delete(opt.id);
                          const next = Array.from(base);
                          return { ...m, styles: next.length > 0 ? next : ["normal"] };
                        });
                      }}
                    />
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-5 h-11 w-full rounded-full bg-foreground text-sm font-medium text-background hover:opacity-90"
              onClick={() => {
                void commitDeckAnswerStyles(cardTypesModal.libraryId, cardTypesModal.deckId, cardTypesModal.styles);
                setCardTypesModal(null);
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}

      {limitsModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setLimitsModal(null); }}
        >
          <div className="w-full max-w-xs rounded-2xl bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Daily limits</h2>
              <button
                type="button"
                onClick={() => setLimitsModal(null)}
                className="rounded-full p-1 text-foreground/50 hover:bg-foreground/10"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-foreground/70">New cards / day</label>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={limitsModal.newPerDay}
                  onChange={(e) => setLimitsModal((m) => m ? { ...m, newPerDay: e.target.value } : m)}
                  className="mt-1 w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-foreground/70">Review cards / day</label>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={limitsModal.reviewsPerDay}
                  onChange={(e) => setLimitsModal((m) => m ? { ...m, reviewsPerDay: e.target.value } : m)}
                  className="mt-1 w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              className="mt-5 h-11 w-full rounded-full bg-foreground text-sm font-medium text-background hover:opacity-90"
              onClick={() => {
                const { libraryId, deckId, newPerDay, reviewsPerDay } = limitsModal;
                void commitNewPerDay(libraryId, deckId, newPerDay);
                void commitReviewsPerDay(libraryId, deckId, reviewsPerDay);
                setLimitsModal(null);
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}

      {matchCardPreview ? (() => {
        const previewCard = matchCardPreview.card;
        const previewPinnedSections = pickFieldSectionsByLabel({
          fieldsHtml: previewCard.fieldsHtml,
          fieldNames: previewCard.fieldNames,
          labelNormalizedInOrder: activePinnedNorm,
        });
        const previewAllSections = inferFieldSectionsForHtml({
          html: previewCard.backHtml,
          fieldsHtml: previewCard.fieldsHtml,
          fieldNames: previewCard.fieldNames,
          hiddenNorm: activeHiddenNorm,
        });
        const previewPinnedIndexes = new Set(previewPinnedSections.map((s) => s.index));
        const previewNonPinnedSections = previewAllSections.filter((s) => !previewPinnedIndexes.has(s.index));

        return (
          <div className="fixed inset-0 z-50 overflow-auto bg-background" onClick={() => setMatchCardPreview(null)}>
            <div className="caliche-container mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:py-12">
              <div className="relative overflow-hidden rounded-3xl border border-foreground/15 bg-surface-strong/70 p-6 shadow-[0_18px_50px_-30px_rgba(6,18,33,0.55)]" onClick={(e) => e.stopPropagation()}>
                {/* Sound + Close buttons */}
                <div className="absolute right-4 top-4 flex items-center gap-2">
                  {matchCardPreview.item.soundFile ? (
                    <SoundButton
                      namespace={activeNamespace}
                      filename={matchCardPreview.item.soundFile}
                      variant="icon"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setMatchCardPreview(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 hover:bg-foreground/10"
                    aria-label="Close"
                  >
                    <FaTimes className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Front */}
                  <div className="py-10">
                    <CardFace
                      namespace={activeNamespace}
                      html={previewCard.frontHtml}
                      className="text-center text-4xl font-semibold leading-tight tracking-tight"
                    />
                  </div>

                  {/* Back */}
                  <div className="border-t border-foreground/15 pt-6">
                    {previewPinnedSections.length > 0 ? (
                      <div className="mb-6 flex flex-col gap-4">
                        {previewPinnedSections.map((sec) => (
                          <div key={`pinned-${sec.index}-${sec.label}`}>
                            <div className="mb-1 text-xs text-center font-medium text-foreground/60">
                              {sec.label}:
                            </div>
                            <CardFace
                              namespace={activeNamespace}
                              html={sec.valueHtml}
                              className="text-center text-xl leading-8"
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {previewNonPinnedSections.length > 0 ? (
                      <div className="flex flex-col gap-4">
                        {previewNonPinnedSections.map((sec) => (
                          <div key={`${sec.index}-${sec.label}`}>
                            <div className="mb-1 text-xs text-center font-medium text-foreground/60">
                              {sec.label}:
                            </div>
                            <CardFace
                              namespace={activeNamespace}
                              html={sec.valueHtml}
                              className="text-center text-xl leading-8"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      previewPinnedSections.length === 0 ? (
                        <CardFace
                          namespace={activeNamespace}
                          html={previewCard.backHtml}
                          className="text-center text-xl leading-8"
                        />
                      ) : null
                    )}
                  </div>

                  <FieldsList
                    namespace={activeNamespace}
                    fields={previewCard.fieldsHtml}
                    names={previewCard.fieldNames}
                    defaultOpen={Boolean(reviewDeckConfig?.cardInfoOpenByDefault)}
                    hiddenNorm={activeHiddenNorm}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}

      {showCountersInfo ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCountersInfo(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">What do the counters mean?</h2>
              <button
                type="button"
                onClick={() => setShowCountersInfo(false)}
                className="rounded-full p-1 text-foreground/50 hover:bg-foreground/10"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-3 text-sm">
              <li>
                <span className="font-medium">Due</span>
                <span className="ml-1 text-foreground/60">— Cards you can answer right now. Includes learning, review, and new cards up to your daily limits.</span>
              </li>
              <li>
                <span className="font-medium">New</span>
                <span className="ml-1 text-foreground/60">— Cards you have never seen before, shown up to your New/day limit.</span>
              </li>
              <li>
                <span className="font-medium">Learning</span>
                <span className="ml-1 text-foreground/60">— Cards in active learning: cards you are seeing for the first time today, plus cards you failed and are relearning. These repeat on short intervals until they graduate.</span>
              </li>
              <li>
                <span className="font-medium">Review</span>
                <span className="ml-1 text-foreground/60">— Cards you already know, returning today based on the spaced-repetition schedule. Shown up to your Review/day limit.</span>
              </li>
              <li>
                <span className="font-medium">Waiting</span>
                <span className="ml-1 text-foreground/60">— Learning cards on a short timer (e.g. 10 min). They are not available yet but will appear automatically when their time is up.</span>
              </li>
            </ul>
          </div>
        </div>
      ) : null}

      {fieldConfigModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setFieldConfigModal(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-foreground/15 bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {fieldConfigModal.type === "hidden" ? "Hidden fields" : "Pinned back fields"}
              </h2>
              <button
                type="button"
                onClick={() => setFieldConfigModal(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-foreground/15 text-foreground/60 hover:bg-foreground/5"
              >
                <FaTimes className="h-3 w-3" />
              </button>
            </div>

            {fieldConfigModal.type === "hidden" ? (
              <HiddenFieldsModalBody
                allFields={fieldConfigModal.allFields}
                current={fieldConfigModal.current}
                onSave={(next) => {
                  void commitDeckHiddenFieldLabels(fieldConfigModal.libraryId, fieldConfigModal.deckId, next);
                  setFieldConfigModal(null);
                }}
              />
            ) : (
              <PinnedFieldsModalBody
                allFields={fieldConfigModal.allFields}
                current={fieldConfigModal.current}
                onSave={(next) => {
                  void commitDeckPinnedBackFieldLabels(fieldConfigModal.libraryId, fieldConfigModal.deckId, next);
                  setFieldConfigModal(null);
                }}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HiddenFieldsModalBody({
  allFields,
  current,
  onSave,
}: {
  allFields: string[];
  current: string[];
  onSave: (next: string[]) => void;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(current));

  const toggle = (field: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-foreground/60">
        Hidden fields never appear in Card info during review.
      </p>
      {allFields.length === 0 ? (
        <p className="text-xs text-foreground/50">No fields found for this deck.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-foreground/10">
          {allFields.map((field) => (
            <label
              key={field}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-foreground/5"
            >
              <span className="truncate">{field}</span>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={hidden.has(field)}
                onChange={() => toggle(field)}
              />
            </label>
          ))}
        </div>
      )}
      <button
        type="button"
        className="caliche-primary-btn mt-1 h-10 rounded-full px-6 text-sm font-medium"
        onClick={() => onSave([...hidden])}
      >
        Save
      </button>
    </div>
  );
}

function PinnedFieldsModalBody({
  allFields,
  current,
  onSave,
}: {
  allFields: string[];
  current: string[];
  onSave: (next: string[]) => void;
}) {
  const [pinned, setPinned] = useState<string[]>(() => current.filter((f) => allFields.includes(f)));

  const available = allFields.filter((f) => !pinned.includes(f));

  const add = (field: string) => setPinned((prev) => [...prev, field]);
  const remove = (idx: number) => setPinned((prev) => prev.filter((_, i) => i !== idx));
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setPinned((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
      return next;
    });
  };
  const moveDown = (idx: number) => {
    setPinned((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-foreground/60">
        Pinned fields appear at the top of the answer. The first one is also used as the Multiple Choice answer source.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-foreground/50">Available</div>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-foreground/10">
            {available.length === 0 ? (
              <p className="px-3 py-2 text-xs text-foreground/40">All fields pinned</p>
            ) : (
              available.map((field) => (
                <button
                  key={field}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-foreground/5"
                  onClick={() => add(field)}
                >
                  <span className="truncate">{field}</span>
                  <span className="shrink-0 text-foreground/40">+</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-foreground/50">Pinned (in order)</div>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-foreground/10">
            {pinned.length === 0 ? (
              <p className="px-3 py-2 text-xs text-foreground/40">None pinned</p>
            ) : (
              pinned.map((field, idx) => (
                <div key={field} className="flex items-center gap-1 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs">{field}</span>
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/40 hover:bg-foreground/10 disabled:opacity-20"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                  >
                    ▴
                  </button>
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/40 hover:bg-foreground/10 disabled:opacity-20"
                    onClick={() => moveDown(idx)}
                    disabled={idx === pinned.length - 1}
                  >
                    ▾
                  </button>
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/40 hover:bg-foreground/10"
                    onClick={() => remove(idx)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="caliche-primary-btn mt-1 h-10 rounded-full px-6 text-sm font-medium"
        onClick={() => onSave(pinned)}
      >
        Save
      </button>
    </div>
  );
}