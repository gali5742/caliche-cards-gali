import type { ScheduleReviewInput, ScheduleReviewResult } from "./types";

export interface ReviewScheduler {
  schedule(input: ScheduleReviewInput): ScheduleReviewResult;
}
