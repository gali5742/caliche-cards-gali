import type { ReviewRating } from "../../domain/review/types";
import type { ScheduleReviewInput, ScheduleReviewResult, SchedulerState } from "./types";

export interface ReviewScheduler {
  schedule(input: ScheduleReviewInput): ScheduleReviewResult;
}

export interface InitializableReviewScheduler extends ReviewScheduler {
  createInitialState(at: number): SchedulerState;
  preview(
    state: SchedulerState | null,
    reviewedAt: number
  ): Record<ReviewRating, SchedulerState>;
}
