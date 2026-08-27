import type {
  ReviewEvent,
  ReviewItem,
  ReviewMode,
  ReviewRating,
} from "../../domain/review/types";
import type {
  ReviewRepository,
  StoredReviewState,
} from "../repositories/reviewRepository";
import type { InitializableReviewScheduler } from "../srs/scheduler";
import {
  createInitialReviewState,
  scheduleReviewState,
} from "./reviewStateService";

export type RecordReviewInput = {
  item: ReviewItem;
  rating: ReviewRating;
  mode: ReviewMode;
  reviewedAt: number;
  responseTimeMs?: number;
  eventId?: string;
};

function createEventId(): string {
  return globalThis.crypto.randomUUID();
}

export async function ensureReviewItems(
  items: ReviewItem[],
  repository: ReviewRepository,
  scheduler: InitializableReviewScheduler,
  at: number
): Promise<StoredReviewState[]> {
  await repository.upsertItems(items);

  return Promise.all(
    items.map(async (item) => {
      const existing = await repository.getState(item.id);
      if (existing) return existing;

      const initial = createInitialReviewState(item, scheduler, at);
      await repository.saveState(initial);
      return initial;
    })
  );
}

export async function recordReview(
  input: RecordReviewInput,
  repository: ReviewRepository,
  scheduler: InitializableReviewScheduler
): Promise<{ state: StoredReviewState; event: ReviewEvent }> {
  await repository.upsertItems([input.item]);

  const current =
    (await repository.getState(input.item.id)) ??
    createInitialReviewState(input.item, scheduler, input.reviewedAt);

  const state = scheduleReviewState(
    current,
    input.rating,
    input.reviewedAt,
    scheduler
  );

  const event: ReviewEvent = {
    id: input.eventId ?? createEventId(),
    reviewItemId: input.item.id,
    reviewedAt: input.reviewedAt,
    rating: input.rating,
    mode: input.mode,
    ...(input.responseTimeMs === undefined
      ? {}
      : { responseTimeMs: input.responseTimeMs }),
  };

  await repository.commitReview(state, event);
  return { state, event };
}
