import type { StudySettings } from "../../domain/settings/types";

export interface SettingsRepository {
  get(): Promise<StudySettings | null>;
  save(settings: StudySettings): Promise<void>;
}
