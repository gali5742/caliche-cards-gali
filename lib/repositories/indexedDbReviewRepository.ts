import type { ReviewEvent, ReviewItem } from "../../domain/review/types";
import {
  getLanguageStudyDb,
  type LanguageStudyDb,
  type StoredReviewItem,
  type StoredReviewStateRow,
} from "../storage/studyDb";
import type { ReviewRepository, StoredReviewState } from "./reviewRepository";

function stripItemMetadata(item: StoredReviewItem): ReviewItem {
  return {
    id: item.id,
    vocabularyId: item.vocabularyId,
    skill: item.skill,
    enabled: item.enabled,
  };
}

function stripStateMetadata(state: StoredReviewStateRow): StoredReviewState {
  return {
    reviewItemId: state.reviewItemId,
    due: state.due,
    state: state.state,
  };
}

function earliestIntroducedAt(items: readonly StoredReviewItem[]): number | undefined {
  const introduced = items
    .map((item) => item.introducedAt)
    .filter((value): value is number => value !== undefined);
  return introduced.length === 0 ? undefined : Math.min(...introduced);
}

export class IndexedDbReviewRepository implements ReviewRepository {
  constructor(private readonly db: LanguageStudyDb = getLanguageStudyDb()) {}

  async upsertItems(items: ReviewItem[]): Promise<void> {
    if (items.length === 0) return;

    const updatedAt = Date.now();
    const vocabularyIds = [...new Set(items.map((item) => item.vocabularyId))];
    const introductionByVocabulary = new Map<string, number>();

    await Promise.all(
      vocabularyIds.map(async (vocabularyId) => {
        const existing = await this.db.reviewItems
          .where("vocabularyId")
          .equals(vocabularyId)
          .toArray();
        const introducedAt = earliestIntroducedAt(existing);
        if (introducedAt !== undefined) {
          introductionByVocabulary.set(vocabularyId, introducedAt);
        }
      })
    );

    await this.db.reviewItems.bulkPut(
      items.map((item) => ({
        ...item,
        updatedAt,
        ...(introductionByVocabulary.has(item.vocabularyId)
          ? { introducedAt: introductionByVocabulary.get(item.vocabularyId) }
          : {}),
      }))
    );
  }

  async getItem(id: string): Promise<ReviewItem | null> {
    const item = await this.db.reviewItems.get(id);
    return item ? stripItemMetadata(item) : null;
  }

  async getItems(ids: readonly string[]): Promise<ReviewItem[]> {
    if (ids.length === 0) return [];
    const items = await this.db.reviewItems.bulkGet([...ids]);
    return items
      .filter((item): item is StoredReviewItem => Boolean(item))
      .map(stripItemMetadata);
  }

  async listItemsForVocabulary(vocabularyId: string): Promise<ReviewItem[]> {
    const items = await this.db.reviewItems
      .where("vocabularyId")
      .equals(vocabularyId)
      .toArray();
    return items.map(stripItemMetadata);
  }

  async listIntroducedVocabularyIds(
    fromInclusive?: number,
    toExclusive?: number
  ): Promise<string[]> {
    let items: StoredReviewItem[];

    if (fromInclusive !== undefined && toExclusive !== undefined) {
      items = await this.db.reviewItems
        .where("introducedAt")
        .between(fromInclusive, toExclusive, true, false)
        .toArray();
    } else if (fromInclusive !== undefined) {
      items = await this.db.reviewItems
        .where("introducedAt")
        .aboveOrEqual(fromInclusive)
        .toArray();
    } else if (toExclusive !== undefined) {
      items = await this.db.reviewItems
        .where("introducedAt")
        .below(toExclusive)
        .toArray();
    } else {
      items = await this.db.reviewItems.where("introducedAt").aboveOrEqual(0).toArray();
    }

    return [...new Set(items.map((item) => item.vocabularyId))];
  }

  async getState(reviewItemId: string): Promise<StoredReviewState | null> {
    const state = await this.db.reviewStates.get(reviewItemId);
    return state ? stripStateMetadata(state) : null;
  }

  async listDueStates(dueThrough: number): Promise<StoredReviewState[]> {
    const states = await this.db.reviewStates
      .where("due")
      .belowOrEqual(dueThrough)
      .toArray();
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
      this.db.reviewItems,
      this.db.reviewStates,
      this.db.reviewEvents,
      async () => {
        const reviewedItem = await this.db.reviewItems.get(event.reviewItemId);
        if (!reviewedItem) {
          throw new Error(`ReviewItem ${event.reviewItemId} is not persisted`);
        }

        const siblings = await this.db.reviewItems
          .where("vocabularyId")
          .equals(reviewedItem.vocabularyId)
          .toArray();
        const introducedAt = earliestIntroducedAt(siblings) ?? event.reviewedAt;

        await this.db.reviewItems.bulkPut(
          siblings.map((item) => ({
            ...item,
            introducedAt: Math.min(
              item.introducedAt ?? introducedAt,
              introducedAt
            ),
            updatedAt: now,
          }))
        );
        await this.db.reviewStates.put({ ...state, updatedAt: now });
        await this.db.reviewEvents.add({ ...event, createdAt: now });
      }
    );
  }
}
