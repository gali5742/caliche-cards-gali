import type { ReviewSkill } from "../../domain/review/types";
import type { StudySettings } from "../../domain/settings/types";
import type { LearningProgress } from "../../domain/textbook/types";
import type { ProgressRepository } from "../repositories/progressRepository";
import type { SettingsRepository } from "../repositories/settingsRepository";
import type { FsrsSchedulerConfig } from "../srs/fsrsTypes";
import {
  getEnabledReviewSkills,
  getFsrsSchedulerConfig,
  loadStudySettings,
} from "../settings/studySettings";
import { loadLearningProgress } from "../textbook/progressService";

export type StudyRuntimeConfig = {
  progress: LearningProgress | null;
  settings: StudySettings;
  reviewSkills: readonly ReviewSkill[];
  fsrsConfig: FsrsSchedulerConfig;
};

export async function loadStudyRuntimeConfig(input: {
  book: number;
  progressRepository: ProgressRepository;
  settingsRepository: SettingsRepository;
}): Promise<StudyRuntimeConfig> {
  const [progress, settings] = await Promise.all([
    loadLearningProgress(input.book, input.progressRepository),
    loadStudySettings(input.settingsRepository),
  ]);

  return {
    progress,
    settings,
    reviewSkills: getEnabledReviewSkills(settings),
    fsrsConfig: getFsrsSchedulerConfig(settings),
  };
}
