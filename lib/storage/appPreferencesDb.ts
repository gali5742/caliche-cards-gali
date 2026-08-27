import Dexie, { type Table } from "dexie";
import type { StudySettings } from "../../domain/settings/types";
import type { LearningProgress } from "../../domain/textbook/types";

export const APP_PREFERENCES_DB_NAME = "bonjour-francais-app";
export const APP_PREFERENCES_DB_VERSION = 1;

export type StoredLearningProgress = LearningProgress & {
  updatedAt: number;
};

export type StoredStudySettings = {
  id: "study";
  value: StudySettings;
  updatedAt: number;
};

export class AppPreferencesDb extends Dexie {
  progress!: Table<StoredLearningProgress, number>;
  settings!: Table<StoredStudySettings, string>;

  constructor() {
    super(APP_PREFERENCES_DB_NAME);

    this.version(APP_PREFERENCES_DB_VERSION).stores({
      progress: "book",
      settings: "id",
    });
  }
}

let db: AppPreferencesDb | null = null;

export function getAppPreferencesDb(): AppPreferencesDb {
  if (!db) db = new AppPreferencesDb();
  return db;
}

export function closeAppPreferencesDb(): void {
  db?.close();
  db = null;
}

export async function deleteAppPreferencesDb(): Promise<void> {
  closeAppPreferencesDb();
  await Dexie.delete(APP_PREFERENCES_DB_NAME);
}
