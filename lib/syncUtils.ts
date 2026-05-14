"use client";

import type { ImportedDeck } from "./apkg";
import { importApkg } from "./apkg";
import { getApkgFile } from "./apkgStorage";
import { getStudyDb } from "./studyDb";
import { upsertImportedDeck } from "./studyApi";

export type DeckDataEnvelopeV1 = {
  version: 1;
  deck: ImportedDeck;
};

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
  label: string
): Promise<Response> {
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
}

export async function exportDeckDataFromStudyDb(libraryId: string): Promise<ImportedDeck> {
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

export async function gzipBytes(bytes: Uint8Array, timeoutMs = 8_000): Promise<Uint8Array | null> {
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

export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
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

export async function encodeDeckDataFile(deck: ImportedDeck): Promise<File> {
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

export async function decodeDeckDataBlob(blob: Blob): Promise<ImportedDeck> {
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

export function isMissingLocalDeckDataError(e: unknown): boolean {
  return (
    e instanceof Error &&
    /isn't available locally yet/i.test(e.message)
  );
}

export async function recoverDeckDataFromCachedApkg(libraryId: string): Promise<ImportedDeck | null> {
  const stored = await getApkgFile(libraryId).catch(() => null);
  if (!stored) return null;

  const file = new File([stored.blob], stored.filename || "deck.apkg", {
    type: "application/octet-stream",
  });

  const imported = await importApkg(file, { mediaNamespace: libraryId });
  await upsertImportedDeck(libraryId, imported);
  return imported;
}
