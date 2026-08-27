import { closeStudyDb, deleteStudyDb, getStudyDb, type StudyDb } from "../studyDb";

export interface LegacyStudyStorage {
  getDb(): StudyDb;
  close(): void;
  delete(): Promise<void>;
}

export class LegacyStudyStorageAdapter implements LegacyStudyStorage {
  getDb(): StudyDb {
    return getStudyDb();
  }

  close(): void {
    closeStudyDb();
  }

  delete(): Promise<void> {
    return deleteStudyDb();
  }
}
