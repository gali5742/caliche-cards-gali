import type { ContentCollection, ContentCollectionRef } from "../../domain/content/types";
import type { LearningProgress } from "../../domain/textbook/types";
import type { DailyStudyRepository } from "../repositories/dailyStudyRepository";
import type { ProgressRepository } from "../repositories/progressRepository";
import type { ReviewRepository } from "../repositories/reviewRepository";
import type { SettingsRepository } from "../repositories/settingsRepository";
import type { VocabularyRepository } from "../repositories/vocabularyRepository";
import { buildTodayReviewQueue, type TodayReviewQueueSummary } from "../review/todayReviewQueue";
import { FsrsScheduler } from "../srs/fsrsAdapter";
import { getDailyExtraNewVocabulary } from "../study/dailyNewVocabularyPlan";
import { saveLearningProgress } from "../textbook/progressService";
import { listRegisteredLessons } from "../textbook/registry";
import { loadStudyRuntimeConfig } from "./studyRuntimeConfig";

export type RegisteredLessonPosition = {
  unit: number;
  lesson: number;
};

export type StudyHomeSnapshot = {
  collection: ContentCollection;
  book: number;
  progress: LearningProgress | null;
  latestRegisteredLesson: RegisteredLessonPosition | null;
  settings: {
    dailyNewVocabularyLimit: number;
    productionEnabled: boolean;
    fsrsRequestRetention: number;
  };
  dailyExtraNewVocabulary: number;
  effectiveDailyNewVocabularyLimit: number;
  queue: TodayReviewQueueSummary | null;
};

function comparePosition(
  a: RegisteredLessonPosition,
  b: RegisteredLessonPosition
): number {
  if (a.unit !== b.unit) return a.unit - b.unit;
  return a.lesson - b.lesson;
}

export function listRegisteredBooks(ref: ContentCollectionRef): number[] {
  return [
    ...new Set(listRegisteredLessons(ref).map((lesson) => lesson.book)),
  ].sort((a, b) => a - b);
}

export function getLatestRegisteredLesson(
  ref: ContentCollectionRef,
  book: number
): RegisteredLessonPosition | null {
  const positions = listRegisteredLessons(ref)
    .filter((lesson) => lesson.book === book)
    .map((lesson) => ({ unit: lesson.unit, lesson: lesson.lesson }))
    .sort(comparePosition);

  return positions.at(-1) ?? null;
}

export async function initializeProgressToLatestRegisteredLesson(input: {
  collection: ContentCollectionRef;
  book: number;
  progressRepository: ProgressRepository;
}): Promise<LearningProgress> {
  const latest = getLatestRegisteredLesson(input.collection, input.book);
  if (!latest) {
    throw new Error("当前词库没有可用于初始化进度的课次");
  }

  const progress: LearningProgress = {
    languageId: input.collection.languageId,
    collectionId: input.collection.collectionId,
    book: input.book,
    unlockedThrough: latest,
  };

  await saveLearningProgress(progress, input.progressRepository);
  return progress;
}

export async function loadStudyHomeSnapshot(input: {
  collection: ContentCollection;
  book: number;
  now: number;
  progressRepository: ProgressRepository;
  settingsRepository: SettingsRepository;
  vocabularyRepository: VocabularyRepository;
  reviewRepository: ReviewRepository;
  dailyStudyRepository?: DailyStudyRepository;
}): Promise<StudyHomeSnapshot> {
  const progressRef = {
    languageId: input.collection.languageId,
    collectionId: input.collection.collectionId,
    book: input.book,
  };
  const runtime = await loadStudyRuntimeConfig({
    progressRef,
    progressRepository: input.progressRepository,
    settingsRepository: input.settingsRepository,
  });

  const latestRegisteredLesson = getLatestRegisteredLesson(
    input.collection,
    input.book
  );
  const dailyExtraNewVocabulary = input.dailyStudyRepository
    ? await getDailyExtraNewVocabulary({
        collection: input.collection,
        book: input.book,
        now: input.now,
        repository: input.dailyStudyRepository,
      })
    : 0;
  const effectiveDailyNewVocabularyLimit =
    runtime.settings.dailyNewVocabularyLimit + dailyExtraNewVocabulary;

  if (!runtime.progress) {
    return {
      collection: input.collection,
      book: input.book,
      progress: null,
      latestRegisteredLesson,
      settings: runtime.settings,
      dailyExtraNewVocabulary,
      effectiveDailyNewVocabularyLimit,
      queue: null,
    };
  }

  const scheduler = new FsrsScheduler(runtime.fsrsConfig);
  const queue = await buildTodayReviewQueue({
    progress: runtime.progress,
    vocabularyRepository: input.vocabularyRepository,
    reviewRepository: input.reviewRepository,
    scheduler,
    now: input.now,
    dailyNewVocabularyLimit: effectiveDailyNewVocabularyLimit,
    skills: runtime.reviewSkills,
  });

  return {
    collection: input.collection,
    book: input.book,
    progress: runtime.progress,
    latestRegisteredLesson,
    settings: runtime.settings,
    dailyExtraNewVocabulary,
    effectiveDailyNewVocabularyLimit,
    queue: queue.summary,
  };
}
