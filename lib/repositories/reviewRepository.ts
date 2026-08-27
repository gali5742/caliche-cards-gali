import type { ReviewEvent, ReviewItem } from "../../domain/review/types";

export type StoredReviewState = {
  reviewItemId: string;
  due: number;
  state: unknown;
};

export interface ReviewRepository {
  getItem(id: string): Promise<ReviewItem | null>;
  listItemsForVocabulary(vocabularyId: string): Promise<ReviewItem[]>;
  getState(reviewItemId: string): Promise<StoredReviewState | null>;
  saveState(state: StoredReviewState): Promise<void>;
  appendEvent(event: ReviewEvent): Promise<void>;
}
