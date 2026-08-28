import type { ContentCollection, ContentCollectionRef } from "../../domain/content/types";
import type {
  LearningProgress,
  TextbookLessonCoverage,
} from "../../domain/textbook/types";
import type { ProgressRepository } from "../repositories/progressRepository";
import {
  loadLearningProgress,
  saveLearningProgress,
} from "../textbook/progressService";
import { listRegisteredLessons } from "../textbook/registry";

export type StudyProgressLessonOption = {
  book: number;
  unit: number;
  lesson: number;
  coverage: TextbookLessonCoverage;
};

function sameCollection(
  a: ContentCollectionRef,
  b: ContentCollectionRef
): boolean {
  return a.languageId === b.languageId && a.collectionId === b.collectionId;
}

export function listStudyProgressLessons(
  collection: ContentCollectionRef,
  book?: number
): StudyProgressLessonOption[] {
  return listRegisteredLessons(collection)
    .filter((lesson) => book === undefined || lesson.book === book)
    .map((lesson) => ({
      book: lesson.book,
      unit: lesson.unit,
      lesson: lesson.lesson,
      coverage: lesson.coverage,
    }))
    .sort(
      (a, b) =>
        a.book - b.book || a.unit - b.unit || a.lesson - b.lesson
    );
}

export async function loadStudyProgress(input: {
  collection: ContentCollection;
  book: number;
  progressRepository: ProgressRepository;
}): Promise<LearningProgress | null> {
  return loadLearningProgress(
    {
      languageId: input.collection.languageId,
      collectionId: input.collection.collectionId,
      book: input.book,
    },
    input.progressRepository
  );
}

export async function saveStudyProgressAtLesson(input: {
  collection: ContentCollection;
  book: number;
  unit: number;
  lesson: number;
  progressRepository: ProgressRepository;
}): Promise<LearningProgress> {
  const registered = listRegisteredLessons(input.collection).find(
    (entry) =>
      sameCollection(entry, input.collection) &&
      entry.book === input.book &&
      entry.unit === input.unit &&
      entry.lesson === input.lesson
  );

  if (!registered) {
    throw new Error("所选课次不在当前词库中");
  }

  const progress: LearningProgress = {
    languageId: input.collection.languageId,
    collectionId: input.collection.collectionId,
    book: input.book,
    unlockedThrough: {
      unit: input.unit,
      lesson: input.lesson,
    },
  };

  await saveLearningProgress(progress, input.progressRepository);
  return progress;
}
