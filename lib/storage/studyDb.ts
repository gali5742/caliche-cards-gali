import Dexie, { type Table } from "dexie";
import type { ReviewEvent, ReviewItem } from "../../domain/review/types";
import type { StudySettings } from "../../domain/settings/types";
import type { DailyStudyPlan } from "../../domain/study/dailyStudy";
import type { LearningProgress } from "../../domain/textbook/types";
import type { StoredReviewState } from "../repositories/reviewRepository";

export const STUDY_DB_NAME = "language-study";
export const STUDY_DB_VERSION = 2;

export type StoredReviewItem = ReviewItem & {
  updatedAt: number;
  introducedAt?: number;
};

export type StoredReviewStateRow = StoredReviewState & {
  updatedAt: number;
};

export type StoredReviewEvent = ReviewEvent & {
  createdAt: number;
};

export type StoredLearningProgress = LearningProgress & {
  id: string;
  updatedAt: number;
};

export type StoredStudySettings = {
  id: "study";
  value: StudySettings;
  updatedAt: number;
};

export type StoredDailyStudyPlan = DailyStudyPlan & {
  id: string;
  updatedAt: number;
};

export class LanguageStudyDb extends Dexie {
  reviewItems!: Table<StoredReviewItem, string>;
  reviewStates!: Table<StoredReviewStateRow, string>;
  reviewEvents!: Table<StoredReviewEvent, string>;
  progress!: Table<StoredLearningProgress, string>;
  settings!: Table<StoredStudySettings, string>;
  dailyStudyPlans!: Table<StoredDailyStudyPlan, string>;

  constructor() {
    super(STUDY_DB_NAME);

    this.version(1).stores({
      reviewItems: "id, vocabularyId, skill, enabled, introducedAt",
      reviewStates: "reviewItemId, due",
      reviewEvents: "id, reviewItemId, reviewedAt, [reviewItemId+reviewedAt]",
      progress: "id, [languageId+collectionId+book]",
      settings: "id",
    });

    this.version(STUDY_DB_VERSION).stores({
      dailyStudyPlans: "id, [languageId+collectionId+book+localDate]",
    });
  }
}

let db: LanguageStudyDb | null = null;

export function getLanguageStudyDb(): LanguageStudyDb {
  if (!db) db = new LanguageStudyDb();
  return db;
}

export function closeLanguageStudyDb(): void {
  db?.close();
  db = null;
}

export async function deleteLanguageStudyDb(): Promise<void> {
  closeLanguageStudyDb();
  await Dexie.delete(STUDY_DB_NAME);
}
