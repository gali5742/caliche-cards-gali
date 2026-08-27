import type { StudySettings } from "../../domain/settings/types";
import {
  getLanguageStudyDb,
  type LanguageStudyDb,
} from "../storage/studyDb";
import type { SettingsRepository } from "./settingsRepository";

export class IndexedDbSettingsRepository implements SettingsRepository {
  constructor(private readonly db: LanguageStudyDb = getLanguageStudyDb()) {}

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
