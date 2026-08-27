import type { ContentCollectionRef } from "../content/types";
import type { VocabularyEntry } from "../vocabulary/types";

export type LessonPosition = {
  unit: number;
  lesson: number;
};

export type LearningProgress = ContentCollectionRef & {
  book: number;
  unlockedThrough: LessonPosition;
};

export type TextbookLessonData = ContentCollectionRef & {
  schemaVersion: 2;
  book: number;
  unit: number;
  lesson: number;
  entries: VocabularyEntry[];
};
