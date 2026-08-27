import type { ReviewEvent, ReviewItem } from "../../domain/review/types";

export type StoredReviewState = {
  reviewItemId: string;
  due: number;
  state: unknown;
};

export interface ReviewRepository {
  upsertItems(items: ReviewItem[]): Promise<void>;
  getItem(id: string): Promise<ReviewItem | null>;
  getItems(ids: readonly string[]): Promise<ReviewItem[]>;
  listItemsForVocabulary(vocabularyId: string): Promise<ReviewItem[]>;
  listIntroducedVocabularyIds(
    fromInclusive?: number,
    toExclusive?: number
  ): Promise<string[]>;
  getState(reviewItemId: string): Promise<StoredReviewState | null>;
  listDueStates(dueThrough: number): Promise<StoredReviewState[]>;
  saveState(state: StoredReviewState): Promise<void>;
  appendEvent(event: ReviewEvent): Promise<void>;
  commitReview(state: StoredReviewState, event: ReviewEvent): Promise<void>;
}
