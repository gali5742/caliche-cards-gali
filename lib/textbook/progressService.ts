import type { LearningProgress } from "../../domain/textbook/types";
import type {
  LearningProgressRef,
  ProgressRepository,
} from "../repositories/progressRepository";

function assertNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function assertValidLearningProgress(
  progress: LearningProgress
): asserts progress is LearningProgress {
  assertNonEmptyString(progress.languageId, "languageId");
  assertNonEmptyString(progress.collectionId, "collectionId");

  if (!Number.isInteger(progress.book) || progress.book < 1) {
    throw new Error("book must be a positive integer");
  }

  if (
    !Number.isInteger(progress.unlockedThrough.unit) ||
    progress.unlockedThrough.unit < 1
  ) {
    throw new Error("unit must be a positive integer");
  }

  if (
    !Number.isInteger(progress.unlockedThrough.lesson) ||
    progress.unlockedThrough.lesson < 1
  ) {
    throw new Error("lesson must be a positive integer");
  }
}

export async function loadLearningProgress(
  ref: LearningProgressRef,
  repository: ProgressRepository
): Promise<LearningProgress | null> {
  const progress = await repository.get(ref);
  if (!progress) return null;
  assertValidLearningProgress(progress);
  return progress;
}

export async function saveLearningProgress(
  progress: LearningProgress,
  repository: ProgressRepository
): Promise<void> {
  assertValidLearningProgress(progress);
  await repository.save(progress);
}
