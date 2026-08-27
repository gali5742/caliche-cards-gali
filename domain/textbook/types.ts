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

export type TextbookLessonCoverage = "complete" | "partial";

export type TextbookLessonData = ContentCollectionRef & {
  schemaVersion: 3;
  book: number;
  unit: number;
  lesson: number;
  coverage: TextbookLessonCoverage;
  entries: VocabularyEntry[];
};
