import type { ContentCollection } from "../../domain/content/types";
import type { LearningProgress, TextbookLessonCoverage } from "../../domain/textbook/types";
import type { VocabularyEntry } from "../../domain/vocabulary/types";
import type { ProgressRepository } from "../repositories/progressRepository";
import { listRegisteredLessons } from "../textbook/registry";
import { vocabularyEntrySearchTerms } from "../vocabulary/searchTerms";

export type StudyVocabularyLesson = {
  book: number;
  unit: number;
  lesson: number;
  coverage: TextbookLessonCoverage;
  entries: VocabularyEntry[];
};

export type StudyVocabularySnapshot = {
  collection: ContentCollection;
  book: number;
  progress: LearningProgress | null;
  lessons: StudyVocabularyLesson[];
};

function compareLessonPosition(
  a: Pick<StudyVocabularyLesson, "unit" | "lesson">,
  b: Pick<StudyVocabularyLesson, "unit" | "lesson">
): number {
  if (a.unit !== b.unit) return a.unit - b.unit;
  return a.lesson - b.lesson;
}

export function isVocabularyLessonUnlocked(
  lesson: Pick<StudyVocabularyLesson, "unit" | "lesson">,
  progress: LearningProgress | null
): boolean {
  if (!progress) return false;
  return compareLessonPosition(lesson, progress.unlockedThrough) <= 0;
}

export function vocabularyEntryMatches(entry: VocabularyEntry, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;

  return vocabularyEntrySearchTerms(entry)
    .join("\n")
    .toLocaleLowerCase()
    .includes(normalized);
}

export async function loadStudyVocabularySnapshot(input: {
  collection: ContentCollection;
  book: number;
  progressRepository: ProgressRepository;
}): Promise<StudyVocabularySnapshot> {
  const lessons = listRegisteredLessons(input.collection)
    .filter((lesson) => lesson.book === input.book)
    .sort((a, b) => {
      if (a.unit !== b.unit) return a.unit - b.unit;
      return a.lesson - b.lesson;
    })
    .map((lesson) => ({
      book: lesson.book,
      unit: lesson.unit,
      lesson: lesson.lesson,
      coverage: lesson.coverage,
      entries: lesson.entries,
    }));

  const progress = await input.progressRepository.get({
    languageId: input.collection.languageId,
    collectionId: input.collection.collectionId,
    book: input.book,
  });

  return {
    collection: input.collection,
    book: input.book,
    progress,
    lessons,
  };
}
