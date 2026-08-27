import type { ReviewItem, ReviewRating } from "../../domain/review/types";
import type { StoredReviewState } from "../repositories/reviewRepository";
import type { InitializableReviewScheduler } from "../srs/scheduler";

function toStoredState(
  reviewItemId: string,
  due: number,
  raw: unknown
): StoredReviewState {
  return {
    reviewItemId,
    due,
    state: raw,
  };
}

export function createInitialReviewState(
  item: ReviewItem,
  scheduler: InitializableReviewScheduler,
  at: number
): StoredReviewState {
  const initial = scheduler.createInitialState(at);
  return toStoredState(item.id, initial.due, initial.raw);
}

export function scheduleReviewState(
  current: StoredReviewState,
  rating: ReviewRating,
  reviewedAt: number,
  scheduler: InitializableReviewScheduler
): StoredReviewState {
  const scheduled = scheduler.schedule({
    state: {
      due: current.due,
      raw: current.state,
    },
    rating,
    reviewedAt,
  });

  return toStoredState(
    current.reviewItemId,
    scheduled.state.due,
    scheduled.state.raw
  );
}

export function previewReviewState(
  current: StoredReviewState,
  reviewedAt: number,
  scheduler: InitializableReviewScheduler
): Record<ReviewRating, StoredReviewState> {
  const preview = scheduler.preview(
    {
      due: current.due,
      raw: current.state,
    },
    reviewedAt
  );

  return {
    again: toStoredState(current.reviewItemId, preview.again.due, preview.again.raw),
    hard: toStoredState(current.reviewItemId, preview.hard.due, preview.hard.raw),
    good: toStoredState(current.reviewItemId, preview.good.due, preview.good.raw),
    easy: toStoredState(current.reviewItemId, preview.easy.due, preview.easy.raw),
  };
}
