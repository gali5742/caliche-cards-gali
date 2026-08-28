import {
  getLanguageStudyDb,
  type LanguageStudyDb,
} from "./studyDb";

export type StudyDbDiagnostics = {
  reviewItems: number;
  reviewStates: number;
  reviewEvents: number;
  progress: number;
  settings: number;
  dailyStudyPlans: number;
};

export async function readStudyDbDiagnostics(
  db: LanguageStudyDb = getLanguageStudyDb()
): Promise<StudyDbDiagnostics> {
  const [
    reviewItems,
    reviewStates,
    reviewEvents,
    progress,
    settings,
    dailyStudyPlans,
  ] = await Promise.all([
    db.reviewItems.count(),
    db.reviewStates.count(),
    db.reviewEvents.count(),
    db.progress.count(),
    db.settings.count(),
    db.dailyStudyPlans.count(),
  ]);

  return {
    reviewItems,
    reviewStates,
    reviewEvents,
    progress,
    settings,
    dailyStudyPlans,
  };
}
