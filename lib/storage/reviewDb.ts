import Dexie, { type Table } from "dexie";
import type { ReviewEvent, ReviewItem } from "../../domain/review/types";
import type { StoredReviewState } from "../repositories/reviewRepository";

export const REVIEW_DB_NAME = "bonjour-francais-review";
export const REVIEW_DB_VERSION = 1;

export type StoredReviewItem = ReviewItem & {
  updatedAt: number;
};

export type StoredReviewStateRow = StoredReviewState & {
  updatedAt: number;
};

export type StoredReviewEvent = ReviewEvent & {
  createdAt: number;
};

export class ReviewDb extends Dexie {
  reviewItems!: Table<StoredReviewItem, string>;
  reviewStates!: Table<StoredReviewStateRow, string>;
  reviewEvents!: Table<StoredReviewEvent, string>;

  constructor() {
    super(REVIEW_DB_NAME);

    this.version(REVIEW_DB_VERSION).stores({
      reviewItems: "id, vocabularyId, skill, enabled",
      reviewStates: "reviewItemId, due",
      reviewEvents: "id, reviewItemId, reviewedAt, [reviewItemId+reviewedAt]",
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
