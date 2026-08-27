import type {
  DailyStudyPlan,
  DailyStudyRef,
} from "../../domain/study/dailyStudy";

export interface DailyStudyRepository {
  get(ref: DailyStudyRef): Promise<DailyStudyPlan | null>;
  save(plan: DailyStudyPlan): Promise<void>;
}
