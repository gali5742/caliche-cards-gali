import type { ReviewEvent, ReviewItem } from "../../domain/review/types";
import { getReviewDb, type ReviewDb } from "../storage/reviewDb";
import type { ReviewRepository, StoredReviewState } from "./reviewRepository";

function stripItemMetadata(item: ReviewItem & { updatedAt?: number }): ReviewItem {
  const { updatedAt: _updatedAt, ...reviewItem } = item;
  return reviewItem;
}

function stripStateMetadata(
  state: StoredReviewState & { updatedAt?: number }
): StoredReviewState {
  const { updatedAt: _updatedAt, ...storedState } = state;
  return storedState;
}

export class IndexedDbReviewRepository implements ReviewRepository {
  constructor(private readonly db: ReviewDb = getReviewDb()) {}

  async upsertItems(items: ReviewItem[]): Promise<void> {
    if (items.length === 0) return;
    const updatedAt = Date.now();
    await this.db.reviewItems.bulkPut(items.map((item) => ({ ...item, updatedAt })));
  }

  async getItem(id: string): Promise<ReviewItem | null> {
    const item = await this.db.reviewItems.get(id);
    return item ? stripItemMetadata(item) : null;
  }

  async listItemsForVocabulary(vocabularyId: string): Promise<ReviewItem[]> {
    const items = await this.db.reviewItems.where("vocabularyId").equals(vocabularyId).toArray();
    return items.map(stripItemMetadata);
  }

  async getState(reviewItemId: string): Promise<StoredReviewState | null> {
    const state = await this.db.reviewStates.get(reviewItemId);
    return state ? stripStateMetadata(state) : null;
  }

  async listDueStates(dueThrough: number): Promise<StoredReviewState[]> {
    const states = await this.db.reviewStates.where("due").belowOrEqual(dueThrough).toArray();
    return states.map(stripStateMetadata);
  }

  async saveState(state: StoredReviewState): Promise<void> {
    await this.db.reviewStates.put({ ...state, updatedAt: Date.now() });
  }

  async appendEvent(event: ReviewEvent): Promise<void> {
    await this.db.reviewEvents.add({ ...event, createdAt: Date.now() });
  }

  async commitReview(state: StoredReviewState, event: ReviewEvent): Promise<void> {
    const now = Date.now();
    await this.db.transaction(
      "rw",
      this.db.reviewStates,
      this.db.reviewEvents,
      async () => {
        await this.db.reviewStates.put({ ...state, updatedAt: now });
        await this.db.reviewEvents.add({ ...event, createdAt: now });
      }
    );
  }
}
