import { State, type Card } from "ts-fsrs";

import type { SchedulerState } from "./types";
import {
  FSRS_PAYLOAD_VERSION,
  type FsrsSchedulerPayload,
  type SerializedFsrsCard,
} from "./fsrsTypes";

const VALID_STATES = new Set<number>([
  State.New,
  State.Learning,
  State.Review,
  State.Relearning,
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isSerializedFsrsCard(value: unknown): value is SerializedFsrsCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<SerializedFsrsCard>;

  return (
    isFiniteNumber(card.due) &&
    isFiniteNumber(card.stability) &&
    isFiniteNumber(card.difficulty) &&
    isFiniteNumber(card.elapsedDays) &&
    isFiniteNumber(card.scheduledDays) &&
    isFiniteNumber(card.learningSteps) &&
    isFiniteNumber(card.reps) &&
    isFiniteNumber(card.lapses) &&
    isFiniteNumber(card.state) &&
    VALID_STATES.has(card.state) &&
    (card.lastReview === null || isFiniteNumber(card.lastReview))
  );
}

export function serializeFsrsCard(card: Card): SerializedFsrsCard {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review?.getTime() ?? null,
  };
}

export function deserializeFsrsCard(card: SerializedFsrsCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    last_review: card.lastReview === null ? undefined : new Date(card.lastReview),
  };
}

export function toSchedulerState(card: Card): SchedulerState {
  const serialized = serializeFsrsCard(card);
  return {
    due: serialized.due,
    raw: {
      kind: "fsrs",
      version: FSRS_PAYLOAD_VERSION,
      card: serialized,
    } satisfies FsrsSchedulerPayload,
  };
}

export function readFsrsSchedulerState(state: SchedulerState): Card {
  if (!state.raw || typeof state.raw !== "object") {
    throw new Error("FSRS scheduler state payload is missing");
  }

  const payload = state.raw as Partial<FsrsSchedulerPayload>;
  if (
    payload.kind !== "fsrs" ||
    payload.version !== FSRS_PAYLOAD_VERSION ||
    !isSerializedFsrsCard(payload.card)
  ) {
    throw new Error("FSRS scheduler state payload is invalid or unsupported");
  }

  if (payload.card.due !== state.due) {
    throw new Error("FSRS scheduler state due date does not match its payload");
  }

  return deserializeFsrsCard(payload.card);
}
