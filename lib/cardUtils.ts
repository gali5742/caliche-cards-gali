import DOMPurify from "dompurify";

import type { ImportedDeck } from "./apkg";
import type { DeckConfig } from "./studyTypes";

// ── Types ────────────────────────────────────────────────────────────────────

export type CardPart =
  | { type: "html"; value: string }
  | { type: "sound"; filename: string };

// ── Sync helpers ─────────────────────────────────────────────────────────────

export function sanitizeWriteLanguage(raw: unknown): DeckConfig["writeLanguage"] {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "fr") return "fr";
  if (v === "es") return "es";
  return "en";
}

export function computeReviewLogSyncKey(log: {
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

// ── HTML sanitization ────────────────────────────────────────────────────────

export function sanitize(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}

// ── Sound tag parsing ────────────────────────────────────────────────────────

export function splitBySoundTag(input: string): CardPart[] {
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

export function extractFirstSoundFilename(input: string): string | null {
  const re = /\[sound:([^\]]+)\]/i;
  const match = re.exec(String(input ?? ""));
  const filename = (match?.[1] ?? "").trim();
  return filename || null;
}

export function soundCandidatesFromFilename(raw: string): string[] {
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

// ── Local media candidate resolution ────────────────────────────────────────

export function localMediaCandidatesFromSrc(src: string): string[] {
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

export function extractMediaCandidatesFromHtml(html: string): string[] {
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

export function extractDeckMediaCandidates(deck: ImportedDeck): string[] {
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

export function preprocessHtmlForLocalImages(html: string): string {
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

// ── Text extraction ──────────────────────────────────────────────────────────

export function htmlToText(inputHtml: string): string {
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

export function htmlToTextWithBreaks(inputHtml: string): string {
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

// ── String utilities ─────────────────────────────────────────────────────────

export function normalizeLabel(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function escapeRegExp(input: string): string {
  return String(input ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toWriteChars(input: string): string[] {
  const normalized = String(input ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/gu, " ");
  if (!normalized) return [];

  // Keep letters (including accents), spaces, and common word punctuation.
  const chars = Array.from(normalized);
  return chars.filter((ch) => /\p{L}/u.test(ch) || ch === " " || ch === "'" || ch === "-");
}

export function extractWriteWordFromText(text: string): string | null {
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

export function normalizeChoiceText(input: string): string {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function capitalizeFirstLetter(s: string): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toLocaleUpperCase() + t.slice(1);
}

// ── Answer extraction ────────────────────────────────────────────────────────

export function extractMultipleChoiceAnswerFromBackHtml(backHtml: string): string | null {
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

export function extractReverseChoiceFromFrontHtml(frontHtml: string): string | null {
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

// ── Field section inference ──────────────────────────────────────────────────

export const HIDDEN_FIELD_LABELS_NORMALIZED = new Set<string>();
export const PINNED_BACK_FIELD_LABELS_NORMALIZED: string[] = [];

export function shouldHideFieldLabel(label: string, hiddenNorm?: Set<string>) {
  const target = normalizeLabel(label);
  if (!target) return false;
  return (hiddenNorm ?? HIDDEN_FIELD_LABELS_NORMALIZED).has(target);
}

export function inferFieldLabelsForHtml(args: {
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

export function inferFieldSectionsForHtml(args: {
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

export function pickFieldSectionsByLabel(args: {
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

export function extractMultipleChoiceAnswerFromCard(card: {
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

  const frontText = htmlToText(card.frontHtml).replace(/\[sound:[^\]]+\]/gi, "").trim().toLowerCase();
  const frontWordRe = new RegExp(`\\b${escapeRegExp(frontText)}\\b`, "iu");

  // Use inferFieldSectionsForHtml to get isolated field values, then sort by
  // appearance order in backHtml so we follow the template's visual order
  // (not the note type's field array order, which can differ).
  const sections = inferFieldSectionsForHtml({
    html: card.backHtml,
    fieldsHtml,
    fieldNames,
  });

  const backHtmlText = htmlToText(card.backHtml).toLowerCase();
  sections.sort((a, b) => {
    const ta = htmlToText(a.valueHtml).toLowerCase();
    const tb = htmlToText(b.valueHtml).toLowerCase();
    const pa = ta ? backHtmlText.indexOf(ta) : Infinity;
    const pb = tb ? backHtmlText.indexOf(tb) : Infinity;
    return pa - pb;
  });

  const pickFromSections = (strict: boolean): string | null => {
    for (const section of sections) {
      const text = htmlToText(section.valueHtml).replace(/\[sound:[^\]]+\]/gi, "").trim();
      if (!text) continue;
      if (text.toLowerCase() === frontText) continue;
      if (strict && frontWordRe.test(text)) continue;
      const beforeSep = text.split(/\s*(?:•|\||;|\/|·)\s*/u)[0]?.trim();
      const answer = String(beforeSep ?? text).replace(/\s+/gu, " ").trim();
      if (answer && answer.toLowerCase() !== frontText) return answer;
    }
    return null;
  };

  return pickFromSections(true) ?? pickFromSections(false);
}

export function pickWriteTargetFromCard(card: {
  frontHtml: string;
  backHtml: string;
  fieldsHtml?: unknown;
  fieldNames?: unknown;
}): string | null {
  // Per product requirement: Write expects the word from the FRONT.
  const fromFront = extractWriteWordFromText(htmlToText(card.frontHtml));
  return fromFront;
}

// ── Seeded shuffle ───────────────────────────────────────────────────────────

export function seededShuffle<T>(items: T[], seed: string): T[] {
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

export function formatIn(ts: number, now: number): string {
  const totalSec = Math.max(0, Math.round((ts - now) / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.ceil(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.ceil(totalMin / 60);
  if (totalHr < 24) return `${totalHr}h`;
  const totalDay = Math.ceil(totalHr / 24);
  return `${totalDay}d`;
}
