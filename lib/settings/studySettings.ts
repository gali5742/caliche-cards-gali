import type { ReviewSkill } from "../../domain/review/types";
import type { StudySettings } from "../../domain/settings/types";
import type { SettingsRepository } from "../repositories/settingsRepository";
import type { FsrsSchedulerConfig } from "../srs/fsrsTypes";

export const DEFAULT_STUDY_SETTINGS: StudySettings = {
  dailyNewVocabularyLimit: 5,
  productionEnabled: true,
  fsrsRequestRetention: 0.9,
};

export function assertValidStudySettings(
  settings: StudySettings
): asserts settings is StudySettings {
  if (
    !Number.isInteger(settings.dailyNewVocabularyLimit) ||
    settings.dailyNewVocabularyLimit < 0 ||
    settings.dailyNewVocabularyLimit > 100
  ) {
    throw new Error("dailyNewVocabularyLimit must be an integer between 0 and 100");
  }

  if (typeof settings.productionEnabled !== "boolean") {
    throw new Error("productionEnabled must be a boolean");
  }

  if (
    !Number.isFinite(settings.fsrsRequestRetention) ||
    settings.fsrsRequestRetention < 0.7 ||
    settings.fsrsRequestRetention > 0.99
  ) {
    throw new Error("fsrsRequestRetention must be between 0.70 and 0.99");
  }
}

export async function loadStudySettings(
  repository: SettingsRepository
): Promise<StudySettings> {
  const stored = await repository.get();
  const settings = stored ?? DEFAULT_STUDY_SETTINGS;
  assertValidStudySettings(settings);
  return { ...settings };
}

export async function saveStudySettings(
  settings: StudySettings,
  repository: SettingsRepository
): Promise<void> {
  assertValidStudySettings(settings);
  await repository.save({ ...settings });
}

export function getEnabledReviewSkills(
  settings: StudySettings
): readonly ReviewSkill[] {
  assertValidStudySettings(settings);
  return settings.productionEnabled
    ? ["recognition", "production"]
    : ["recognition"];
}

export function getFsrsSchedulerConfig(
  settings: StudySettings
): FsrsSchedulerConfig {
  assertValidStudySettings(settings);
  return {
    requestRetention: settings.fsrsRequestRetention,
  };
}
