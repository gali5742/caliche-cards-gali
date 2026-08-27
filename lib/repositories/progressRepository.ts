import type { LearningProgress } from "../../domain/textbook/types";

export interface ProgressRepository {
  get(book: number): Promise<LearningProgress | null>;
  save(progress: LearningProgress): Promise<void>;
}
