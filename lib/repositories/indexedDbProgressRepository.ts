import type { LearningProgress } from "../../domain/textbook/types";
import { getReviewDb, type ReviewDb } from "../storage/reviewDb";
import type { ProgressRepository } from "./progressRepository";

export class IndexedDbProgressRepository implements ProgressRepository {
  constructor(private readonly db: ReviewDb = getReviewDb()) {}

  async get(book: number): Promise<LearningProgress | null> {
    const row = await this.db.progress.get(book);
    if (!row) return null;

    return {
      book: row.book,
      unlockedThrough: {
        unit: row.unlockedThrough.unit,
        lesson: row.unlockedThrough.lesson,
      },
    };
  }

  async save(progress: LearningProgress): Promise<void> {
    await this.db.progress.put({ ...progress, updatedAt: Date.now() });
  }
}
