import type { VocabularyEntry } from "../vocabulary/types";

export type LessonPosition = {
  unit: number;
  lesson: number;
};

export type LearningProgress = {
  book: number;
  unlockedThrough: LessonPosition;
};

export type TextbookLessonData = {
  schemaVersion: 1;
  textbookId: string;
  book: number;
  unit: number;
  lesson: number;
  entries: VocabularyEntry[];
};
