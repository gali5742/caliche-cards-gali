import type { TodayReviewQueueEntry } from "./todayReviewQueue";
import { readFsrsSchedulerState } from "../srs/fsrsMapping";

const DAY_MS = 24 * 60 * 60 * 1000;
const SIBLING_GAP = 3;

export const DEFAULT_PRACTICE_ITEM_LIMIT = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function practicePriorityWeight(
  entry: TodayReviewQueueEntry,
  now: number
): number {
  try {
    const card = readFsrsSchedulerState({
      due: entry.state.due,
      raw: entry.state.state,
    });

    const dueDeltaDays = (card.due.getTime() - now) / DAY_MS;
    let dueFactor = 1;
    if (dueDeltaDays <= 0) {
      const overdueDays = Math.abs(dueDeltaDays);
      dueFactor = 3 + Math.min(overdueDays / 7, 2);
    } else if (dueDeltaDays <= 1) {
      dueFactor = 2.5;
    } else if (dueDeltaDays <= 3) {
      dueFactor = 2;
    } else if (dueDeltaDays <= 7) {
      dueFactor = 1.5;
    }

    const normalizedDifficulty = clamp((card.difficulty - 1) / 9, 0, 1);
    const difficultyFactor = 0.8 + normalizedDifficulty * 0.8;

    const stabilityDays = Math.max(0, card.stability);
    const stabilityFactor = 0.85 + 0.9 / (1 + stabilityDays / 7);

    const lapseFactor = 1 + Math.min(card.lapses, 5) * 0.12;

    let recencyFactor = 1;
    if (card.last_review) {
      const ageDays = Math.max(0, (now - card.last_review.getTime()) / DAY_MS);
      const expectedIntervalDays = Math.max(1, card.scheduled_days);
      const intervalProgress = clamp(ageDays / expectedIntervalDays, 0, 1.5);
      recencyFactor = 0.8 + intervalProgress * 0.4;
    }

    return Math.max(
      0.05,
      dueFactor * difficultyFactor * stabilityFactor * lapseFactor * recencyFactor
    );
  } catch {
    // A readable practice item should remain eligible even if an old or
    // unsupported scheduler payload is encountered.
    return 1;
  }
}

function weightedKey(weight: number, random: () => number): number {
  const sample = clamp(random(), Number.EPSILON, 1 - Number.EPSILON);
  return -Math.log(sample) / Math.max(weight, Number.EPSILON);
}

function separateSiblingItems(
  entries: TodayReviewQueueEntry[]
): TodayReviewQueueEntry[] {
  const ordered = [...entries];

  for (let index = 1; index < ordered.length; index += 1) {
    const recentVocabularyIds = new Set(
      ordered
        .slice(Math.max(0, index - SIBLING_GAP), index)
        .map((entry) => entry.item.vocabularyId)
    );

    if (!recentVocabularyIds.has(ordered[index].item.vocabularyId)) continue;

    const replacementIndex = ordered.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        !recentVocabularyIds.has(candidate.item.vocabularyId)
    );

    if (replacementIndex > index) {
      [ordered[index], ordered[replacementIndex]] = [
        ordered[replacementIndex],
        ordered[index],
      ];
    }
  }

  return ordered;
}

export function samplePracticeEntries(input: {
  entries: TodayReviewQueueEntry[];
  now: number;
  limit?: number;
  random?: () => number;
}): TodayReviewQueueEntry[] {
  const limit = Math.max(
    0,
    Math.floor(input.limit ?? DEFAULT_PRACTICE_ITEM_LIMIT)
  );
  if (limit === 0 || input.entries.length === 0) return [];

  const random = input.random ?? Math.random;
  const selected = input.entries
    .map((entry) => ({
      entry,
      key: weightedKey(practicePriorityWeight(entry, input.now), random),
    }))
    .sort((a, b) => a.key - b.key)
    .slice(0, limit)
    .map(({ entry }) => entry);

  return separateSiblingItems(selected);
}
