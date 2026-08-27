import type { ReviewRating } from "../../domain/review/types";
import type { ReviewScheduler } from "../srs/scheduler";
import type { ScheduleReviewInput, ScheduleReviewResult, SchedulerState } from "../srs/types";
import { scheduleAnswer } from "../scheduler";
import type { CardStateEntity, DeckConfig } from "../studyTypes";

export type LegacySchedulerPayload = {
  cardState: CardStateEntity;
  deckConfig: DeckConfig;
};

function mapRatingToLegacyResult(rating: ReviewRating): "pass" | "fail" {
  return rating === "again" ? "fail" : "pass";
}

function readLegacyPayload(state: SchedulerState | null): LegacySchedulerPayload {
  if (!state || !state.raw || typeof state.raw !== "object") {
    throw new Error("Legacy scheduler adapter requires an existing legacy card state payload");
  }

  const payload = state.raw as Partial<LegacySchedulerPayload>;
  if (!payload.cardState || !payload.deckConfig) {
    throw new Error("Legacy scheduler adapter received an invalid payload");
  }

  return payload as LegacySchedulerPayload;
}

export class LegacySchedulerAdapter implements ReviewScheduler {
  schedule(input: ScheduleReviewInput): ScheduleReviewResult {
    const payload = readLegacyPayload(input.state);
    const scheduled = scheduleAnswer(
      payload.cardState,
      mapRatingToLegacyResult(input.rating),
      input.reviewedAt,
      payload.deckConfig
    );

    const nextCardState: CardStateEntity = {
      ...payload.cardState,
      state: scheduled.nextState,
      due: scheduled.nextDue,
      intervalDays: scheduled.nextIntervalDays,
      stepIndex: scheduled.nextStepIndex,
      reps: scheduled.nextReps,
      lapses: scheduled.nextLapses,
      lastReview: input.reviewedAt,
      updatedAt: input.reviewedAt,
    };

    return {
      state: {
        due: nextCardState.due,
        raw: {
          cardState: nextCardState,
          deckConfig: payload.deckConfig,
        } satisfies LegacySchedulerPayload,
      },
    };
  }
}
