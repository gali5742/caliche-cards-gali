import type { DeckRef } from "./studyTypes";
import { getStudyDb } from "./studyDb";
import {
  extractMultipleChoiceAnswerFromCard,
  extractReverseChoiceFromFrontHtml,
  htmlToText,
  normalizeChoiceText,
} from "./cardUtils";

export type MatchItem = { cardId: number; front: string; back: string; soundFile?: string };

export async function preloadMcAnswerPool(
  ref: DeckRef,
  pinnedNorm: string[]
): Promise<{ all: string[]; reviewed: string[] }> {
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
    }, pinnedNorm);
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

export async function preloadReverseFrontPool(ref: DeckRef): Promise<string[]> {
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

export async function preloadMatchPool(
  ref: DeckRef,
  pinnedNorm: string[]
): Promise<MatchItem[]> {
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
      }, pinnedNorm) ?? htmlToText(c.backHtml).replace(/\[sound:[^\]]+\]/gi, "").trim();
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
