import type { ReviewRating } from "../../domain/review/types";

export type SchedulerState = {
  due: number;
  raw: unknown;
};

export type ScheduleReviewInput = {
  state: SchedulerState | null;
  rating: ReviewRating;
  reviewedAt: number;
};

export type ScheduleReviewResult = {
  state: SchedulerState;
};
