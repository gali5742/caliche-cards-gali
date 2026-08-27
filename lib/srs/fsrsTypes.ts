import type { StepUnit } from "ts-fsrs";

export const FSRS_PAYLOAD_VERSION = 1 as const;

export type SerializedFsrsCard = {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number | null;
};

export type FsrsSchedulerPayload = {
  kind: "fsrs";
  version: typeof FSRS_PAYLOAD_VERSION;
  card: SerializedFsrsCard;
};

export type FsrsSchedulerConfig = {
  requestRetention?: number;
  maximumIntervalDays?: number;
  enableFuzz?: boolean;
  enableShortTerm?: boolean;
  learningSteps?: StepUnit[];
  relearningSteps?: StepUnit[];
};
