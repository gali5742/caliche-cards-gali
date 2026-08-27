import type { ReviewItem, ReviewSkill } from "../../domain/review/types";
import type { LearningProgress } from "../../domain/textbook/types";
import type { VocabularyEntry } from "../../domain/vocabulary/types";
import type {
  ReviewRepository,
  StoredReviewState,
} from "../repositories/reviewRepository";
import type { VocabularyRepository } from "../repositories/vocabularyRepository";
import { isNewFsrsSchedulerState } from "../srs/fsrsState";
import type { InitializableReviewScheduler } from "../srs/scheduler";
import { ensureReviewItems } from "./reviewPersistenceService";
import {
  generateReviewItems,
  type ReviewItemGenerationOptions,
} from "./reviewItemGenerator";

export type TodayReviewQueueKind = "due" | "continuation" | "new";

export type TodayReviewQueueEntry = {
  item: ReviewItem;
  vocabulary: VocabularyEntry;
  state: StoredReviewState;
  kind: TodayReviewQueueKind;
};

export type TodayReviewQueueSummary = {
  dueItems: number;
  continuationItems: number;
  newItems: number;
  newVocabulary: number;
  introducedVocabularyToday: number;
  remainingNewVocabularyCapacity: number;
  availableNewVocabulary: number;
  totalItems: number;
};

export type TodayReviewQueue = {
  entries: TodayReviewQueueEntry[];
  summary: TodayReviewQueueSummary;
};

export type BuildTodayReviewQueueInput = {
  progress: LearningProgress;
  vocabularyRepository: VocabularyRepository;
  reviewRepository: ReviewRepository;
  scheduler: InitializableReviewScheduler;
  now: number;
  dailyNewVocabularyLimit: number;
  skills?: readonly ReviewSkill[];
};

export type LocalDayBounds = {
  start: number;
  end: number;
};

export function getLocalDayBounds(timestamp: number): LocalDayBounds {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    throw new Error("Cannot build review queue for an invalid timestamp");
  }

  const start = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  ).getTime();
  const end = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate() + 1
  ).getTime();

  return { start, end };
}

function normalizeDailyNewLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 0) {
    throw new Error("dailyNewVocabularyLimit must be a non-negative number");
  }
  return Math.floor(limit);
}

function isNewState(state: StoredReviewState): boolean {
  return isNewFsrsSchedulerState({
    due: state.due,
    raw: state.state,
  });
}

function skillOrder(skill: ReviewSkill): number {
  return skill === "recognition" ? 0 : 1;
}

function makeEntry(
  item: ReviewItem,
  vocabulary: VocabularyEntry,
  state: StoredReviewState,
  kind: TodayReviewQueueKind
): TodayReviewQueueEntry {
  return { item, vocabulary, state, kind };
}

export async function buildTodayReviewQueue(
  input: BuildTodayReviewQueueInput
): Promise<TodayReviewQueue> {
  const dailyNewVocabularyLimit = normalizeDailyNewLimit(
    input.dailyNewVocabularyLimit
  );
  const lessonRef = {
    languageId: input.progress.languageId,
    collectionId: input.progress.collectionId,
    book: input.progress.book,
    unit: input.progress.unlockedThrough.unit,
    lesson: input.progress.unlockedThrough.lesson,
  };

  const vocabulary = await input.vocabularyRepository.listUnlocked(lessonRef);
  const generationOptions: ReviewItemGenerationOptions = input.skills
    ? { skills: input.skills }
    : {};
  const generatedItems = generateReviewItems(vocabulary, generationOptions);

  await ensureReviewItems(
    generatedItems,
    input.reviewRepository,
    input.scheduler,
    input.now
  );

  const generatedItemIds = new Set(generatedItems.map((item) => item.id));
  const dueStates = (await input.reviewRepository.listDueStates(input.now)).filter(
    (state) => generatedItemIds.has(state.reviewItemId)
  );
  const persistedItems = await input.reviewRepository.getItems(
    dueStates.map((state) => state.reviewItemId)
  );

  const itemById = new Map(persistedItems.map((item) => [item.id, item]));
  const vocabularyById = new Map(vocabulary.map((entry) => [entry.id, entry]));
  const vocabularyOrder = new Map(
    vocabulary.map((entry, index) => [entry.id, index])
  );

  const { start: dayStart, end: dayEnd } = getLocalDayBounds(input.now);
  const [introducedVocabulary, introducedVocabularyToday] = await Promise.all([
    input.reviewRepository.listIntroducedVocabularyIds(),
    input.reviewRepository.listIntroducedVocabularyIds(dayStart, dayEnd),
  ]);
  const introduced = new Set(introducedVocabulary);
  const introducedToday = new Set(introducedVocabularyToday);

  const dueEntries: TodayReviewQueueEntry[] = [];
  const continuationEntries: TodayReviewQueueEntry[] = [];
  const freshNewStates = new Map<string, StoredReviewState[]>();

  for (const state of dueStates) {
    const item = itemById.get(state.reviewItemId);
    if (!item?.enabled) continue;
    const entry = vocabularyById.get(item.vocabularyId);
    if (!entry) continue;

    if (!isNewState(state)) {
      dueEntries.push(makeEntry(item, entry, state, "due"));
      continue;
    }

    if (introduced.has(item.vocabularyId)) {
      continuationEntries.push(makeEntry(item, entry, state, "continuation"));
      continue;
    }

    const states = freshNewStates.get(item.vocabularyId) ?? [];
    states.push(state);
    freshNewStates.set(item.vocabularyId, states);
  }

  const remainingNewVocabularyCapacity = Math.max(
    0,
    dailyNewVocabularyLimit - introducedToday.size
  );
  const freshVocabularyIds = vocabulary
    .map((entry) => entry.id)
    .filter((vocabularyId) => freshNewStates.has(vocabularyId));
  const selectedFreshVocabularyIds = new Set(
    freshVocabularyIds.slice(0, remainingNewVocabularyCapacity)
  );

  const newEntries: TodayReviewQueueEntry[] = [];
  for (const vocabularyId of selectedFreshVocabularyIds) {
    const entry = vocabularyById.get(vocabularyId);
    if (!entry) continue;

    for (const state of freshNewStates.get(vocabularyId) ?? []) {
      const item = itemById.get(state.reviewItemId);
      if (!item?.enabled) continue;
      newEntries.push(makeEntry(item, entry, state, "new"));
    }
  }

  dueEntries.sort(
    (a, b) =>
      a.state.due - b.state.due ||
      (vocabularyOrder.get(a.item.vocabularyId) ?? Number.MAX_SAFE_INTEGER) -
        (vocabularyOrder.get(b.item.vocabularyId) ?? Number.MAX_SAFE_INTEGER) ||
      skillOrder(a.item.skill) - skillOrder(b.item.skill)
  );
  continuationEntries.sort(
    (a, b) =>
      (vocabularyOrder.get(a.item.vocabularyId) ?? Number.MAX_SAFE_INTEGER) -
        (vocabularyOrder.get(b.item.vocabularyId) ?? Number.MAX_SAFE_INTEGER) ||
      skillOrder(a.item.skill) - skillOrder(b.item.skill)
  );
  newEntries.sort(
    (a, b) =>
      skillOrder(a.item.skill) - skillOrder(b.item.skill) ||
      (vocabularyOrder.get(a.item.vocabularyId) ?? Number.MAX_SAFE_INTEGER) -
        (vocabularyOrder.get(b.item.vocabularyId) ?? Number.MAX_SAFE_INTEGER)
  );

  const entries = [...dueEntries, ...continuationEntries, ...newEntries];
  return {
    entries,
    summary: {
      dueItems: dueEntries.length,
      continuationItems: continuationEntries.length,
      newItems: newEntries.length,
      newVocabulary: selectedFreshVocabularyIds.size,
      introducedVocabularyToday: introducedToday.size,
      remainingNewVocabularyCapacity,
      availableNewVocabulary: freshVocabularyIds.length,
      totalItems: entries.length,
    },
  };
}
