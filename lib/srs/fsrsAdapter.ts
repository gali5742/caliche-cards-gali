import {
  Rating,
  createEmptyCard,
  fsrs,
  type Grade,
} from "ts-fsrs";

import type { ReviewRating } from "../../domain/review/types";
import type { InitializableReviewScheduler } from "./scheduler";
import type { ScheduleReviewInput, ScheduleReviewResult, SchedulerState } from "./types";
import type { FsrsSchedulerConfig } from "./fsrsTypes";
import { readFsrsSchedulerState, toSchedulerState } from "./fsrsMapping";

function toGrade(rating: ReviewRating): Grade {
  switch (rating) {
    case "again":
      return Rating.Again;
    case "hard":
      return Rating.Hard;
    case "good":
      return Rating.Good;
    case "easy":
      return Rating.Easy;
  }
}

function validateConfig(config: FsrsSchedulerConfig): void {
  if (
    config.requestRetention !== undefined &&
    (!Number.isFinite(config.requestRetention) ||
      config.requestRetention <= 0 ||
      config.requestRetention > 1)
  ) {
    throw new Error("FSRS request retention must be greater than 0 and at most 1");
  }

  if (
    config.maximumIntervalDays !== undefined &&
    (!Number.isInteger(config.maximumIntervalDays) || config.maximumIntervalDays < 1)
  ) {
    throw new Error("FSRS maximum interval must be a positive integer number of days");
  }
}

export class FsrsScheduler implements InitializableReviewScheduler {
  private readonly scheduler;

  constructor(config: FsrsSchedulerConfig = {}) {
    validateConfig(config);

    this.scheduler = fsrs({
      request_retention: config.requestRetention ?? 0.9,
      maximum_interval: config.maximumIntervalDays ?? 36500,
      enable_fuzz: config.enableFuzz ?? true,
      enable_short_term: config.enableShortTerm ?? true,
      ...(config.learningSteps ? { learning_steps: config.learningSteps } : {}),
      ...(config.relearningSteps ? { relearning_steps: config.relearningSteps } : {}),
    });
  }

  createInitialState(at: number): SchedulerState {
    return toSchedulerState(createEmptyCard(new Date(at)));
  }

  schedule(input: ScheduleReviewInput): ScheduleReviewResult {
    const card = input.state
      ? readFsrsSchedulerState(input.state)
      : createEmptyCard(new Date(input.reviewedAt));

    const result = this.scheduler.next(
      card,
      new Date(input.reviewedAt),
      toGrade(input.rating)
    );

    return { state: toSchedulerState(result.card) };
  }

  preview(
    state: SchedulerState | null,
    reviewedAt: number
  ): Record<ReviewRating, SchedulerState> {
    const card = state
      ? readFsrsSchedulerState(state)
      : createEmptyCard(new Date(reviewedAt));
    const preview = this.scheduler.repeat(card, new Date(reviewedAt));

    return {
      again: toSchedulerState(preview[Rating.Again].card),
      hard: toSchedulerState(preview[Rating.Hard].card),
      good: toSchedulerState(preview[Rating.Good].card),
      easy: toSchedulerState(preview[Rating.Easy].card),
    };
  }
}
