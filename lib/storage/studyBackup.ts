import {
  getLanguageStudyDb,
  STUDY_DB_VERSION,
  type LanguageStudyDb,
  type StoredDailyStudyPlan,
  type StoredLearningProgress,
  type StoredReviewEvent,
  type StoredReviewItem,
  type StoredReviewStateRow,
  type StoredStudySettings,
} from "./studyDb";

export const STUDY_BACKUP_FORMAT = "language-study-backup" as const;
export const STUDY_BACKUP_VERSION = 1 as const;

export type StudyBackupData = {
  reviewItems: StoredReviewItem[];
  reviewStates: StoredReviewStateRow[];
  reviewEvents: StoredReviewEvent[];
  progress: StoredLearningProgress[];
  settings: StoredStudySettings[];
  dailyStudyPlans: StoredDailyStudyPlan[];
};

export type StudyBackup = {
  format: typeof STUDY_BACKUP_FORMAT;
  version: typeof STUDY_BACKUP_VERSION;
  dbVersion: number;
  exportedAt: number;
  data: StudyBackupData;
};

export type StudyBackupCounts = {
  reviewItems: number;
  reviewStates: number;
  reviewEvents: number;
  progress: number;
  settings: number;
  dailyStudyPlans: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} 不是有效的数组`);
}

function validateReviewItems(value: unknown): asserts value is StoredReviewItem[] {
  assertArray(value, "reviewItems");
  for (const row of value) {
    if (
      !isRecord(row) ||
      !isNonEmptyString(row.id) ||
      !isNonEmptyString(row.vocabularyId) ||
      (row.skill !== "recognition" && row.skill !== "production") ||
      typeof row.enabled !== "boolean" ||
      !isFiniteNumber(row.updatedAt) ||
      (row.introducedAt !== undefined && !isFiniteNumber(row.introducedAt))
    ) {
      throw new Error("reviewItems 中存在无效记录");
    }
  }
}

function validateReviewStates(value: unknown): asserts value is StoredReviewStateRow[] {
  assertArray(value, "reviewStates");
  for (const row of value) {
    if (
      !isRecord(row) ||
      !isNonEmptyString(row.reviewItemId) ||
      !isFiniteNumber(row.due) ||
      !isFiniteNumber(row.updatedAt) ||
      !("state" in row)
    ) {
      throw new Error("reviewStates 中存在无效记录");
    }
  }
}

function validateReviewEvents(value: unknown): asserts value is StoredReviewEvent[] {
  const ratings = new Set(["again", "hard", "good", "easy"]);
  const modes = new Set(["recall", "multiple-choice", "typing", "audio"]);
  assertArray(value, "reviewEvents");
  for (const row of value) {
    if (
      !isRecord(row) ||
      !isNonEmptyString(row.id) ||
      !isNonEmptyString(row.reviewItemId) ||
      !isFiniteNumber(row.reviewedAt) ||
      !ratings.has(String(row.rating)) ||
      !modes.has(String(row.mode)) ||
      !isFiniteNumber(row.createdAt) ||
      (row.responseTimeMs !== undefined && !isFiniteNumber(row.responseTimeMs))
    ) {
      throw new Error("reviewEvents 中存在无效记录");
    }
  }
}

function validateProgress(value: unknown): asserts value is StoredLearningProgress[] {
  assertArray(value, "progress");
  for (const row of value) {
    if (
      !isRecord(row) ||
      !isNonEmptyString(row.id) ||
      !isNonEmptyString(row.languageId) ||
      !isNonEmptyString(row.collectionId) ||
      !isPositiveInteger(row.book) ||
      !isRecord(row.unlockedThrough) ||
      !isPositiveInteger(row.unlockedThrough.unit) ||
      !isPositiveInteger(row.unlockedThrough.lesson) ||
      !isFiniteNumber(row.updatedAt)
    ) {
      throw new Error("progress 中存在无效记录");
    }
  }
}

function validateSettings(value: unknown): asserts value is StoredStudySettings[] {
  assertArray(value, "settings");
  for (const row of value) {
    const dailyNewVocabularyLimit = isRecord(row) && isRecord(row.value)
      ? row.value.dailyNewVocabularyLimit
      : undefined;
    const fsrsRequestRetention = isRecord(row) && isRecord(row.value)
      ? row.value.fsrsRequestRetention
      : undefined;

    if (
      !isRecord(row) ||
      row.id !== "study" ||
      !isRecord(row.value) ||
      !isNonNegativeInteger(dailyNewVocabularyLimit) ||
      Number(dailyNewVocabularyLimit) > 100 ||
      typeof row.value.productionEnabled !== "boolean" ||
      !isFiniteNumber(fsrsRequestRetention) ||
      Number(fsrsRequestRetention) < 0.7 ||
      Number(fsrsRequestRetention) > 0.99 ||
      !isFiniteNumber(row.updatedAt)
    ) {
      throw new Error("settings 中存在无效记录");
    }
  }
}

function validateDailyStudyPlans(value: unknown): asserts value is StoredDailyStudyPlan[] {
  assertArray(value, "dailyStudyPlans");
  for (const row of value) {
    if (
      !isRecord(row) ||
      !isNonEmptyString(row.id) ||
      !isNonEmptyString(row.languageId) ||
      !isNonEmptyString(row.collectionId) ||
      !isPositiveInteger(row.book) ||
      !isNonEmptyString(row.localDate) ||
      !isNonNegativeInteger(row.extraNewVocabulary) ||
      !isFiniteNumber(row.updatedAt)
    ) {
      throw new Error("dailyStudyPlans 中存在无效记录");
    }
  }
}

export async function createStudyBackup(
  db: LanguageStudyDb = getLanguageStudyDb()
): Promise<StudyBackup> {
  const [reviewItems, reviewStates, reviewEvents, progress, settings, dailyStudyPlans] =
    await Promise.all([
      db.reviewItems.toArray(),
      db.reviewStates.toArray(),
      db.reviewEvents.toArray(),
      db.progress.toArray(),
      db.settings.toArray(),
      db.dailyStudyPlans.toArray(),
    ]);

  return {
    format: STUDY_BACKUP_FORMAT,
    version: STUDY_BACKUP_VERSION,
    dbVersion: STUDY_DB_VERSION,
    exportedAt: Date.now(),
    data: {
      reviewItems,
      reviewStates,
      reviewEvents,
      progress,
      settings,
      dailyStudyPlans,
    },
  };
}

export function parseStudyBackup(value: unknown): StudyBackup {
  if (!isRecord(value)) throw new Error("不是有效的学习数据备份");
  if (value.format !== STUDY_BACKUP_FORMAT) throw new Error("无法识别这个备份文件");
  if (value.version !== STUDY_BACKUP_VERSION) throw new Error("暂不支持这个备份版本");
  if (!isFiniteNumber(value.dbVersion) || !isFiniteNumber(value.exportedAt)) {
    throw new Error("备份文件信息不完整");
  }
  if (!isRecord(value.data)) throw new Error("备份文件缺少学习数据");

  validateReviewItems(value.data.reviewItems);
  validateReviewStates(value.data.reviewStates);
  validateReviewEvents(value.data.reviewEvents);
  validateProgress(value.data.progress);
  validateSettings(value.data.settings);
  validateDailyStudyPlans(value.data.dailyStudyPlans);

  return value as StudyBackup;
}

export function getStudyBackupCounts(backup: StudyBackup): StudyBackupCounts {
  return {
    reviewItems: backup.data.reviewItems.length,
    reviewStates: backup.data.reviewStates.length,
    reviewEvents: backup.data.reviewEvents.length,
    progress: backup.data.progress.length,
    settings: backup.data.settings.length,
    dailyStudyPlans: backup.data.dailyStudyPlans.length,
  };
}

export function buildStudyBackupFilename(exportedAt: number): string {
  const value = new Date(exportedAt);
  const pad = (part: number) => String(part).padStart(2, "0");
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}${pad(value.getMinutes())}`;
  return `language-study-backup-${date}-${time}.json`;
}

export async function restoreStudyBackup(
  backup: StudyBackup,
  db: LanguageStudyDb = getLanguageStudyDb()
): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.reviewItems,
      db.reviewStates,
      db.reviewEvents,
      db.progress,
      db.settings,
      db.dailyStudyPlans,
    ],
    async () => {
      await Promise.all([
        db.reviewItems.clear(),
        db.reviewStates.clear(),
        db.reviewEvents.clear(),
        db.progress.clear(),
        db.settings.clear(),
        db.dailyStudyPlans.clear(),
      ]);

      if (backup.data.reviewItems.length) await db.reviewItems.bulkPut(backup.data.reviewItems);
      if (backup.data.reviewStates.length) await db.reviewStates.bulkPut(backup.data.reviewStates);
      if (backup.data.reviewEvents.length) await db.reviewEvents.bulkPut(backup.data.reviewEvents);
      if (backup.data.progress.length) await db.progress.bulkPut(backup.data.progress);
      if (backup.data.settings.length) await db.settings.bulkPut(backup.data.settings);
      if (backup.data.dailyStudyPlans.length) {
        await db.dailyStudyPlans.bulkPut(backup.data.dailyStudyPlans);
      }
    }
  );
}
