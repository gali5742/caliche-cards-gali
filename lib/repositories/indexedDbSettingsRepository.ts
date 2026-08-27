import type { StudySettings } from "../../domain/settings/types";
import { getReviewDb, type ReviewDb } from "../storage/reviewDb";
import type { SettingsRepository } from "./settingsRepository";

export class IndexedDbSettingsRepository implements SettingsRepository {
  constructor(private readonly db: ReviewDb = getReviewDb()) {}

  async get(): Promise<StudySettings | null> {
    const row = await this.db.settings.get("study");
    return row ? { ...row.value } : null;
  }

  async save(settings: StudySettings): Promise<void> {
    await this.db.settings.put({
      id: "study",
      value: { ...settings },
      updatedAt: Date.now(),
    });
  }
}
