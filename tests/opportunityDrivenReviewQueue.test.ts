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
import { buildReviewItemId } from "../lib/review/reviewItemGenerator";
import { buildTodayReviewQueue } from "../lib/review/todayReviewQueue";
import type { InitializableReviewScheduler } from "../lib/srs/scheduler";
import type { SchedulerState } from "../lib/srs/types";

const LANGUAGE_ID = "fr";
const COLLECTION_ID = "bonjour-francais";

function makeVocabulary(id: string): VocabularyEntry {
  return {
    id,
    lemma: id,
    meaningsZh: [id],
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
        scheduledDays: input.state === State.Review ? 3 : 0,
        learningSteps:
          input.state === State.Learning || input.state === State.Relearning ? 1 : 0,
        reps: input.reps,
        lapses: input.state === State.Relearning ? 1 : 0,
        state: input.state,
        lastReview: input.lastReview ?? null,
      },
    },
  };
}

function toStoredState(reviewItemId: string, state: SchedulerState): StoredReviewState {
  return { reviewItemId, due: state.due, state: state.raw };
}

class DeterministicScheduler implements InitializableReviewScheduler {
  createInitialState(at: number): SchedulerState {
    return makeSchedulerState({ due: at, state: State.New, reps: 0 });
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

  seed(item: ReviewItem, state: StoredReviewState, introducedAt: number): void {
    this.items.set(item.id, item);
    this.states.set(state.reviewItemId, state);
    this.introducedAt.set(item.vocabularyId, introducedAt);
  }

  async upsertItems(items: ReviewItem[]): Promise<void> {
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
    this.states.set(state.reviewItemId, state);
  }

  async appendEvent(_event: ReviewEvent): Promise<void> {}

  async commitReview(state: StoredReviewState, event: ReviewEvent): Promise<void> {
    this.states.set(state.reviewItemId, state);
    const item = this.items.get(state.reviewItemId);
    if (item && !this.introducedAt.has(item.vocabularyId)) {
      this.introducedAt.set(item.vocabularyId, event.reviewedAt);
    }
  }
}

function makeReviewItem(
  vocabularyId: string,
  skill: "recognition" | "production"
): ReviewItem {
  return {
    id: buildReviewItemId(vocabularyId, skill),
    vocabularyId,
    skill,
    enabled: true,
  };
}

test("a long-term review due later today is available from the start of the local day", async () => {
  const now = new Date(2026, 8, 3, 8, 0, 0).getTime();
  const dueTonight = new Date(2026, 8, 3, 23, 30, 0).getTime();
  const yesterday = new Date(2026, 8, 2, 8, 0, 0).getTime();
  const vocabularyRepository = new MemoryVocabularyRepository([makeVocabulary("v1")]);
  const reviewRepository = new MemoryReviewRepository();
  const item = makeReviewItem("v1", "recognition");

  reviewRepository.seed(
    item,
    toStoredState(
      item.id,
      makeSchedulerState({
        due: dueTonight,
        state: State.Review,
        reps: 3,
        lastReview: yesterday,
      })
    ),
    yesterday
  );

  const queue = await buildTodayReviewQueue({
    progress: makeProgress(),
    vocabularyRepository,
    reviewRepository,
    scheduler: new DeterministicScheduler(),
    now,
    dailyNewVocabularyLimit: 0,
    skills: ["recognition"],
  });

  assert.equal(queue.summary.scheduledReviewItems, 1);
  assert.equal(queue.summary.pendingReinforcementVocabulary, 0);
  assert.equal(queue.entries.length, 1);
});

test("a long-term review due tomorrow does not leak into today's queue", async () => {
  const now = new Date(2026, 8, 3, 8, 0, 0).getTime();
  const dueTomorrow = new Date(2026, 8, 4, 8, 0, 0).getTime();
  const yesterday = new Date(2026, 8, 2, 8, 0, 0).getTime();
  const vocabularyRepository = new MemoryVocabularyRepository([makeVocabulary("v1")]);
  const reviewRepository = new MemoryReviewRepository();
  const item = makeReviewItem("v1", "recognition");

  reviewRepository.seed(
    item,
    toStoredState(
      item.id,
      makeSchedulerState({
        due: dueTomorrow,
        state: State.Review,
        reps: 3,
        lastReview: yesterday,
      })
    ),
    yesterday
  );

  const queue = await buildTodayReviewQueue({
    progress: makeProgress(),
    vocabularyRepository,
    reviewRepository,
    scheduler: new DeterministicScheduler(),
    now,
    dailyNewVocabularyLimit: 0,
    skills: ["recognition"],
  });

  assert.equal(queue.entries.length, 0);
  assert.equal(queue.summary.scheduledReviewItems, 0);
});

test("Learning and Relearning remain pending reinforcement without minute-level due gating", async () => {
  const now = new Date(2026, 8, 3, 8, 0, 0).getTime();
  const futureDue = new Date(2026, 8, 4, 18, 0, 0).getTime();
  const yesterday = new Date(2026, 8, 2, 8, 0, 0).getTime();
  const vocabularyRepository = new MemoryVocabularyRepository([makeVocabulary("v1")]);
  const reviewRepository = new MemoryReviewRepository();
  const item = makeReviewItem("v1", "recognition");

  reviewRepository.seed(
    item,
    toStoredState(
      item.id,
      makeSchedulerState({
        due: futureDue,
        state: State.Learning,
        reps: 1,
        lastReview: yesterday,
      })
    ),
    yesterday
  );

  const queue = await buildTodayReviewQueue({
    progress: makeProgress(),
    vocabularyRepository,
    reviewRepository,
    scheduler: new DeterministicScheduler(),
    now,
    dailyNewVocabularyLimit: 0,
    skills: ["recognition"],
  });

  assert.equal(queue.entries.length, 1);
  assert.equal(queue.entries[0]?.sameDayReinforcement, true);
  assert.equal(queue.summary.sameDayReinforcementItems, 1);
  assert.equal(queue.summary.pendingReinforcementVocabulary, 1);
  assert.equal(queue.summary.scheduledReviewItems, 0);
});

test("pending reinforcement is counted by vocabulary, not by recognition and production items", async () => {
  const now = new Date(2026, 8, 3, 8, 0, 0).getTime();
  const futureDue = new Date(2026, 8, 4, 18, 0, 0).getTime();
  const yesterday = new Date(2026, 8, 2, 8, 0, 0).getTime();
  const vocabularyRepository = new MemoryVocabularyRepository([makeVocabulary("v1")]);
  const reviewRepository = new MemoryReviewRepository();

  for (const skill of ["recognition", "production"] as const) {
    const item = makeReviewItem("v1", skill);
    reviewRepository.seed(
      item,
      toStoredState(
        item.id,
        makeSchedulerState({
          due: futureDue,
          state: State.Relearning,
          reps: 2,
          lastReview: yesterday,
        })
      ),
      yesterday
    );
  }

  const queue = await buildTodayReviewQueue({
    progress: makeProgress(),
    vocabularyRepository,
    reviewRepository,
    scheduler: new DeterministicScheduler(),
    now,
    dailyNewVocabularyLimit: 0,
  });

  assert.equal(queue.summary.sameDayReinforcementItems, 2);
  assert.equal(queue.summary.pendingReinforcementVocabulary, 1);
  assert.equal(queue.summary.totalItems, 2);
});
