import type {
  DailyStudyPlan,
  DailyStudyRef,
} from "../../domain/study/dailyStudy";
import { getLanguageStudyDb, type LanguageStudyDb } from "../storage/studyDb";
import type { DailyStudyRepository } from "./dailyStudyRepository";

function planId(ref: DailyStudyRef): string {
  return `${ref.languageId}:${ref.collectionId}:${ref.book}:${ref.localDate}`;
}

export class IndexedDbDailyStudyRepository implements DailyStudyRepository {
  constructor(private readonly db: LanguageStudyDb = getLanguageStudyDb()) {}

  async get(ref: DailyStudyRef): Promise<DailyStudyPlan | null> {
    const stored = await this.db.dailyStudyPlans.get(planId(ref));
    if (!stored) return null;

    return {
      languageId: stored.languageId,
      collectionId: stored.collectionId,
      book: stored.book,
      localDate: stored.localDate,
      extraNewVocabulary: stored.extraNewVocabulary,
    };
  }

  async save(plan: DailyStudyPlan): Promise<void> {
    await this.db.dailyStudyPlans.put({
      ...plan,
      id: planId(plan),
      updatedAt: Date.now(),
    });
  }
}
