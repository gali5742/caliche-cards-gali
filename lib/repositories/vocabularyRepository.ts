import type { ContentCollectionRef } from "../../domain/content/types";
import type { VocabularyEntry } from "../../domain/vocabulary/types";

export type VocabularyLessonRef = ContentCollectionRef & {
  book: number;
  unit: number;
  lesson: number;
};

export interface VocabularyRepository {
  getById(id: string): Promise<VocabularyEntry | null>;
  listByLesson(ref: VocabularyLessonRef): Promise<VocabularyEntry[]>;
  listUnlocked(ref: VocabularyLessonRef): Promise<VocabularyEntry[]>;
  search(query: string): Promise<VocabularyEntry[]>;
}
