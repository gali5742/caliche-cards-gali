import type { StudySettings } from "../../domain/settings/types";
import type { SettingsRepository } from "../repositories/settingsRepository";
import {
  DEFAULT_STUDY_SETTINGS,
  loadStudySettings,
  saveStudySettings,
} from "../settings/studySettings";

export type StudySettingsSnapshot = {
  settings: StudySettings;
  defaults: StudySettings;
};

export async function loadStudySettingsSnapshot(
  repository: SettingsRepository
): Promise<StudySettingsSnapshot> {
  const settings = await loadStudySettings(repository);
  return {
    settings,
    defaults: { ...DEFAULT_STUDY_SETTINGS },
  };
}

export async function persistStudySettings(
  settings: StudySettings,
  repository: SettingsRepository
): Promise<StudySettings> {
  await saveStudySettings(settings, repository);
  return { ...settings };
}
