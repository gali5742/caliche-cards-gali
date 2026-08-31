import type { ContentCollection } from "../../domain/content/types";
import type {
  ReviewItem,
  ReviewMode,
  ReviewRating,
} from "../../domain/review/types";
import type { LearningProgress } from "../../domain/textbook/types";
import type { DailyStudyRepository } from "../repositories/dailyStudyRepository";
import type { ProgressRepository } from "../repositories/progressRepository";
import type { ReviewRepository } from "../repositories/reviewRepository";
import type { SettingsRepository } from "../repositories/settingsRepository";
import type { VocabularyRepository } from "../repositories/vocabularyRepository";
import { buildPracticeReviewQueue } from "../review/practiceReviewQueue";
import { recordReview } from "../review/reviewPersistenceService";
import {
  buildTodayReviewQueue,
  type TodayReviewQueue,
} from "../review/todayReviewQueue";
import { FsrsScheduler } from "../srs/fsrsAdapter";
import type { FsrsSchedulerConfig } from "../srs/fsrsTypes";
import { getDailyExtraNewVocabulary } from "../study/dailyNewVocabularyPlan";
import { loadStudyRuntimeConfig } from "./studyRuntimeConfig";

export type StudyReviewSessionMode = "scheduled" | "practice";

export type StudyReviewSession = {
  collection: ContentCollection;
  book: number;
  progress: LearningProgress;
  fsrsConfig: FsrsSchedulerConfig;
  queue: TodayReviewQueue;
  mode: StudyReviewSessionMode;
  newVocabularyBatchSize: number;
};

type LoadStudyReviewSessionInput = {
  collection: ContentCollection;
  book: number;
  now: number;
  progressRepository: ProgressRepository;
  settingsRepository: SettingsRepository;
  vocabularyRepository: VocabularyRepository;
  reviewRepository: ReviewRepository;
  dailyStudyRepository?: DailyStudyRepository;
};

export async function loadStudyReviewSession(
  input: LoadStudyReviewSessionInput
): Promise<StudyReviewSession | null> {
  const runtime = await loadStudyRuntimeConfig({
    progressRef: {
      languageId: input.collection.languageId,
      collectionId: input.collection.collectionId,
      book: input.book,
    },
    progressRepository: input.progressRepository,
    settingsRepository: input.settingsRepository,
  });

  if (!runtime.progress) return null;

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
    fsrsConfig: runtime.fsrsConfig,
    queue,
    mode: "scheduled",
    newVocabularyBatchSize: runtime.settings.dailyNewVocabularyLimit,
  };
}

export async function loadStudyPracticeSession(
  input: LoadStudyReviewSessionInput
): Promise<StudyReviewSession | null> {
  const runtime = await loadStudyRuntimeConfig({
    progressRef: {
      languageId: input.collection.languageId,
      collectionId: input.collection.collectionId,
      book: input.book,
    },
    progressRepository: input.progressRepository,
    settingsRepository: input.settingsRepository,
  });

  if (!runtime.progress) return null;

  const queue = await buildPracticeReviewQueue({
    progress: runtime.progress,
    vocabularyRepository: input.vocabularyRepository,
    reviewRepository: input.reviewRepository,
    skills: runtime.reviewSkills,
    now: input.now,
  });

  return {
    collection: input.collection,
    book: input.book,
    progress: runtime.progress,
    fsrsConfig: runtime.fsrsConfig,
    queue,
    mode: "practice",
    newVocabularyBatchSize: runtime.settings.dailyNewVocabularyLimit,
  };
}

export async function commitStudyReviewAnswer(input: {
  item: ReviewItem;
  rating: ReviewRating;
  mode: ReviewMode;
  reviewedAt: number;
  responseTimeMs?: number;
  fsrsConfig: FsrsSchedulerConfig;
  reviewRepository: ReviewRepository;
}): Promise<void> {
  const scheduler = new FsrsScheduler(input.fsrsConfig);

  await recordReview(
    {
      item: input.item,
      rating: input.rating,
      mode: input.mode,
      reviewedAt: input.reviewedAt,
      responseTimeMs: input.responseTimeMs,
    },
    input.reviewRepository,
    scheduler
  );
}
