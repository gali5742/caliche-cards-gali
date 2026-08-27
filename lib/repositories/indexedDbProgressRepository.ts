import type { LearningProgress } from "../../domain/textbook/types";
import {
  getLanguageStudyDb,
  type LanguageStudyDb,
} from "../storage/studyDb";
import type {
  LearningProgressRef,
  ProgressRepository,
} from "./progressRepository";

function buildProgressId(ref: LearningProgressRef): string {
  return `${ref.languageId}:${ref.collectionId}:book:${ref.book}`;
}

export class IndexedDbProgressRepository implements ProgressRepository {
  constructor(private readonly db: LanguageStudyDb = getLanguageStudyDb()) {}

  async get(ref: LearningProgressRef): Promise<LearningProgress | null> {
    const row = await this.db.progress.get(buildProgressId(ref));
    if (!row) return null;

    return {
      languageId: row.languageId,
      collectionId: row.collectionId,
      book: row.book,
      unlockedThrough: {
        unit: row.unlockedThrough.unit,
        lesson: row.unlockedThrough.lesson,
      },
    };
  }

  async save(progress: LearningProgress): Promise<void> {
    await this.db.progress.put({
      ...progress,
      id: buildProgressId(progress),
      updatedAt: Date.now(),
    });
  }
}
