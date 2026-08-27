export type StorageMigration = {
  version: number;
  migrate: () => Promise<void>;
};

export interface AppStorage {
  open(): Promise<void>;
  close(): void;
}
