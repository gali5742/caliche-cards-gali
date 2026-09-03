import assert from "node:assert/strict";
import test from "node:test";
import { State } from "ts-fsrs";

import type { ReviewEvent, ReviewItem, ReviewRating } from "../domain/review/types";
import type { LearningProgress } from "../domain/textbook/types";
import type { VocabularyEntry } from "../domain/vocabulary/types";
import type {
  ReviewRepository,
  StoredReviewState,
} from "../lib/repositories/reviewRepository";
import type {
  VocabularyLessonRef,
  VocabularyRepository,
} from "../lib/repositories/vocabularyRepository";
import { buildPracticeReviewQueue } from "../lib/review/practiceReviewQueue";
import { buildReviewItemId } from "../lib/review/reviewItemGenerator";
import { buildTodayReviewQueue } from "../lib/review/todayReviewQueue";
import type { InitializableReviewScheduler } from "../lib/srs/scheduler";
import type { SchedulerState } from "../lib/srs/types";

const LANGUAGE_ID = "fr";
const COLLECTION_ID = "bonjour-francais";

function makeVocabulary(id: string, lemma: string): VocabularyEntry {
  return {
    id,
    lemma,
    meaningsZh: [lemma],
    partOfSpeech: "nom",
    source: {
      kind: "textbook",
      languageId: LANGUAGE_ID,
      collectionId: COLLECTION_ID,
      book: 1,
      unit: 1,
      lesson: 1,
    },
  };
}

function makeProgress(): LearningProgress {
  return {
    languageId: LANGUAGE_ID,
    collectionId: COLLECTION_ID,
    book: 1,
    unlockedThrough: { unit: 1, lesson: 1 },
  };
}

function makeSchedulerState(input: {
  due: number;
  state: State;
  reps: number;
  lastReview?: number | null;
}): SchedulerState {
  return {
    due: input.due,
    raw: {
      kind: "fsrs",
      version: 1,
      card: {
        due: input.due,
        stability: input.state === State.New ? 0 : 3,
        difficulty: input.state === State.New ? 0 : 5,
        elapsedDays: 0,
        scheduledDays: 0,
        learningSteps: 0,
        reps: input.reps,
        lapses: 0,
        state: input.state,
        lastReview: input.lastReview ?? null,
      },
    },
  };
}

function toStoredState(reviewItemId: string, state: SchedulerState): StoredReviewState {
  return {
    reviewItemId,
    due: state.due,
    state: state.raw,
  };
}

class DeterministicScheduler implements InitializableReviewScheduler {
  createInitialState(at: number): SchedulerState {
    return makeSchedulerState({
      due: at,
      state: State.New,
      reps: 0,
    });
  }

  schedule(input: {
    state: SchedulerState | null;
    rating: ReviewRating;
    reviewedAt: number;
  }): { state: SchedulerState } {
    return {
      state:
        input.state ??
        makeSchedulerState({
          due: input.reviewedAt,
          state: State.New,
          reps: 0,
        }),
    };
  }

  preview(
    state: SchedulerState | null,
    reviewedAt: number
  ): Record<ReviewRating, SchedulerState> {
    const current =
      state ??
      makeSchedulerState({
        due: reviewedAt,
        state: State.New,
        reps: 0,
      });
    return {
      again: current,
      hard: current,
      good: current,
      easy: current,
    };
  }
}

class MemoryVocabularyRepository implements VocabularyRepository {
  constructor(private readonly entries: VocabularyEntry[]) {}

  async getById(id: string): Promise<VocabularyEntry | null> {
    return this.entries.find((entry) => entry.id === id) ?? null;
  }

  async listByLesson(_ref: VocabularyLessonRef): Promise<VocabularyEntry[]> {
    return [...this.entries];
  }

  async listUnlocked(_ref: VocabularyLessonRef): Promise<VocabularyEntry[]> {
    return [...this.entries];
  }

  async search(_query: string): Promise<VocabularyEntry[]> {
    return [...this.entries];
  }
}

class MemoryReviewRepository implements ReviewRepository {
  private readonly items = new Map<string, ReviewItem>();
  private readonly states = new Map<string, StoredReviewState>();
  private readonly introducedAt = new Map<string, number>();

  writes = {
    upsertItems: 0,
    saveState: 0,
    appendEvent: 0,
    commitReview: 0,
  };

  seedState(state: StoredReviewState): void {
    this.states.set(state.reviewItemId, state);
  }

  seedIntroduced(vocabularyId: string, at: number): void {
    this.introducedAt.set(vocabularyId, at);
  }

  seedItem(item: ReviewItem): void {
    this.items.set(item.id, item);
  }

  async upsertItems(items: ReviewItem[]): Promise<void> {
    this.writes.upsertItems += 1;
    for (const item of items) this.items.set(item.id, item);
  }

  async getItem(id: string): Promise<ReviewItem | null> {
    return this.items.get(id) ?? null;
  }

  async getItems(ids: readonly string[]): Promise<ReviewItem[]> {
    return ids
      .map((id) => this.items.get(id))
      .filter((item): item is ReviewItem => item !== undefined);
  }

  async listItemsForVocabulary(vocabularyId: string): Promise<ReviewItem[]> {
    return [...this.items.values()].filter(
      (item) => item.vocabularyId === vocabularyId
    );
  }

  async listIntroducedVocabularyIds(
    fromInclusive?: number,
    toExclusive?: number
  ): Promise<string[]> {
    return [...this.introducedAt.entries()]
      .filter(([, at]) =>
        (fromInclusive === undefined || at >= fromInclusive) &&
        (toExclusive === undefined || at < toExclusive)
      )
      .map(([id]) => id);
  }

  async getState(reviewItemId: string): Promise<StoredReviewState | null> {
    return this.states.get(reviewItemId) ?? null;
  }

  async listDueStates(dueThrough: number): Promise<StoredReviewState[]> {
    return [...this.states.values()].filter((state) => state.due <= dueThrough);
  }

  async saveState(state: StoredReviewState): Promise<void> {
    this.writes.saveState += 1;
    this.states.set(state.reviewItemId, state);
  }

  async appendEvent(_event: ReviewEvent): Promise<void> {
    this.writes.appendEvent += 1;
  }

  async commitReview(state: StoredReviewState, event: ReviewEvent): Promise<void> {
    this.writes.commitReview += 1;
    this.states.set(state.reviewItemId, state);
    const item = this.items.get(state.reviewItemId);
    if (item && !this.introducedAt.has(item.vocabularyId)) {
      this.introducedAt.set(item.vocabularyId, event.reviewedAt);
    }
  }
}

function makeReviewItem(vocabularyId: string, skill: "recognition" | "production"): ReviewItem {
  return {
    id: buildReviewItemId(vocabularyId, skill),
    vocabularyId,
    skill,
    enabled: true,
  };
}

test("daily new limit counts vocabulary entries, not recognition/production items", async () => {
  const now = new Date(2026, 8, 3, 12, 0, 0).getTime();
  const vocabularyRepository = new MemoryVocabularyRepository([
    makeVocabulary("v1", "bonjour"),
    makeVocabulary("v2", "merci"),
  ]);
  const reviewRepository = new MemoryReviewRepository();

  const queue = await buildTodayReviewQueue({
    progress: makeProgress(),
    vocabularyRepository,
    reviewRepository,
    scheduler: new DeterministicScheduler(),
    now,
    dailyNewVocabularyLimit: 1,
  });

  assert.equal(queue.summary.newVocabulary, 1);
  assert.equal(queue.summary.newItems, 2);
  assert.deepEqual(
    queue.entries.map((entry) => entry.item.vocabularyId),
    ["v1", "v1"]
  );
});

test("recognition-only mode creates one fresh review item per vocabulary", async () => {
  const now = new Date(2026, 8, 3, 12, 0, 0).getTime();
  const vocabularyRepository = new MemoryVocabularyRepository([
    makeVocabulary("v1", "bonjour"),
  ]);
  const reviewRepository = new MemoryReviewRepository();

  const queue = await buildTodayReviewQueue({
    progress: makeProgress(),
    vocabularyRepository,
    reviewRepository,
    scheduler: new DeterministicScheduler(),
    now,
    dailyNewVocabularyLimit: 1,
    skills: ["recognition"],
  });

  assert.equal(queue.summary.newVocabulary, 1);
  assert.equal(queue.summary.newItems, 1);
  assert.equal(queue.entries[0]?.item.skill, "recognition");
});

test("an older vocabulary reviewed earlier today is classified as same-day reinforcement", async () => {
  const now = new Date(2026, 8, 3, 15, 0, 0).getTime();
  const earlierToday = new Date(2026, 8, 3, 10, 0, 0).getTime();
  const previousDay = new Date(2026, 8, 2, 10, 0, 0).getTime();
  const vocabularyRepository = new MemoryVocabularyRepository([
    makeVocabulary("v1", "bonjour"),
  ]);
  const reviewRepository = new MemoryReviewRepository();

  const recognition = makeReviewItem("v1", "recognition");
  const production = makeReviewItem("v1", "production");
  reviewRepository.seedItem(recognition);
  reviewRepository.seedItem(production);
  reviewRepository.seedIntroduced("v1", previousDay);
  reviewRepository.seedState(
    toStoredState(
      recognition.id,
      makeSchedulerState({
        due: now - 1,
        state: State.Review,
        reps: 3,
        lastReview: earlierToday,
      })
    )
  );
  reviewRepository.seedState(
    toStoredState(
      production.id,
      makeSchedulerState({
        due: now + 60_000,
        state: State.Review,
        reps: 3,
        lastReview: previousDay,
      })
    )
  );

  const queue = await buildTodayReviewQueue({
    progress: makeProgress(),
    vocabularyRepository,
    reviewRepository,
    scheduler: new DeterministicScheduler(),
    now,
    dailyNewVocabularyLimit: 10,
  });

  assert.equal(queue.summary.sameDayReinforcementItems, 1);
  assert.equal(queue.summary.scheduledReviewItems, 1);
  assert.equal(queue.entries[0]?.sameDayReinforcement, true);
});

test("daily new capacity resets at the next local calendar day", async () => {
  const introducedBeforeMidnight = new Date(2026, 8, 3, 23, 59, 0).getTime();
  const now = new Date(2026, 8, 4, 0, 1, 0).getTime();
  const vocabularyRepository = new MemoryVocabularyRepository([
    makeVocabulary("v1", "bonjour"),
    makeVocabulary("v2", "merci"),
  ]);
  const reviewRepository = new MemoryReviewRepository();

  reviewRepository.seedIntroduced("v1", introducedBeforeMidnight);
  for (const skill of ["recognition", "production"] as const) {
    const item = makeReviewItem("v1", skill);
    reviewRepository.seedItem(item);
    reviewRepository.seedState(
      toStoredState(
        item.id,
        makeSchedulerState({
          due: now + 86_400_000,
          state: State.Review,
          reps: 2,
          lastReview: introducedBeforeMidnight,
        })
      )
    );
  }

  const queue = await buildTodayReviewQueue({
    progress: makeProgress(),
    vocabularyRepository,
    reviewRepository,
    scheduler: new DeterministicScheduler(),
    now,
    dailyNewVocabularyLimit: 1,
  });

  assert.equal(queue.summary.introducedVocabularyToday, 0);
  assert.equal(queue.summary.remainingNewVocabularyCapacity, 1);
  assert.equal(queue.summary.newVocabulary, 1);
  assert.equal(queue.entries.at(-1)?.item.vocabularyId, "v2");
});

test("free review builds a queue without writing review state or events", async () => {
  const now = new Date(2026, 8, 3, 12, 0, 0).getTime();
  const vocabularyRepository = new MemoryVocabularyRepository([
    makeVocabulary("v1", "bonjour"),
  ]);
  const reviewRepository = new MemoryReviewRepository();

  const recognition = makeReviewItem("v1", "recognition");
  reviewRepository.seedItem(recognition);
  reviewRepository.seedIntroduced("v1", now - 86_400_000);
  reviewRepository.seedState(
    toStoredState(
      recognition.id,
      makeSchedulerState({
        due: now + 86_400_000,
        state: State.Review,
        reps: 2,
        lastReview: now - 86_400_000,
      })
    )
  );

  const writesBefore = { ...reviewRepository.writes };
  const queue = await buildPracticeReviewQueue({
    progress: makeProgress(),
    vocabularyRepository,
    reviewRepository,
    skills: ["recognition"],
    now,
    itemLimit: 20,
  });

  assert.equal(queue.entries.length, 1);
  assert.deepEqual(reviewRepository.writes, writesBefore);
});
