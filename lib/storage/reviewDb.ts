import Dexie, { type Table } from "dexie";
import type { ReviewEvent, ReviewItem } from "../../domain/review/types";
import type { StudySettings } from "../../domain/settings/types";
import type { LearningProgress } from "../../domain/textbook/types";
import type { StoredReviewState } from "../repositories/reviewRepository";

export const REVIEW_DB_NAME = "bonjour-francais-review";
export const REVIEW_DB_VERSION = 3;

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
  updatedAt: number;
};

export type StoredStudySettings = {
  id: "study";
  value: StudySettings;
  updatedAt: number;
};

export class ReviewDb extends Dexie {
  reviewItems!: Table<StoredReviewItem, string>;
  reviewStates!: Table<StoredReviewStateRow, string>;
  reviewEvents!: Table<StoredReviewEvent, string>;
  progress!: Table<StoredLearningProgress, number>;
  settings!: Table<StoredStudySettings, string>;

  constructor() {
    super(REVIEW_DB_NAME);

    this.version(1).stores({
      reviewItems: "id, vocabularyId, skill, enabled",
      reviewStates: "reviewItemId, due",
      reviewEvents: "id, reviewItemId, reviewedAt, [reviewItemId+reviewedAt]",
    });

    this.version(2).stores({
      reviewItems: "id, vocabularyId, skill, enabled, introducedAt",
      reviewStates: "reviewItemId, due",
      reviewEvents: "id, reviewItemId, reviewedAt, [reviewItemId+reviewedAt]",
    });

    this.version(REVIEW_DB_VERSION).stores({
      reviewItems: "id, vocabularyId, skill, enabled, introducedAt",
      reviewStates: "reviewItemId, due",
      reviewEvents: "id, reviewItemId, reviewedAt, [reviewItemId+reviewedAt]",
      progress: "book",
      settings: "id",
    });
  }
}

let db: ReviewDb | null = null;

export function getReviewDb(): ReviewDb {
  if (!db) db = new ReviewDb();
  return db;
}

export function closeReviewDb(): void {
  db?.close();
  db = null;
}

export async function deleteReviewDb(): Promise<void> {
  closeReviewDb();
  await Dexie.delete(REVIEW_DB_NAME);
}
