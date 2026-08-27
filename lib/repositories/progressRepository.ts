import type { LearningProgress } from "../../domain/textbook/types";

export type LearningProgressRef = Pick<
  LearningProgress,
  "languageId" | "collectionId" | "book"
>;

export interface ProgressRepository {
  get(ref: LearningProgressRef): Promise<LearningProgress | null>;
  save(progress: LearningProgress): Promise<void>;
}
