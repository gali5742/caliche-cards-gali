import {
  readPwaDiagnostics,
  type PwaDiagnostics,
} from "../platform/pwaDiagnostics";
import {
  readStorageDiagnostics,
  type StorageDiagnostics,
} from "../platform/storageDiagnostics";
import {
  readStudyDbDiagnostics,
  type StudyDbDiagnostics,
} from "../storage/studyDbDiagnostics";

export type StudyDiagnosticsSnapshot = {
  checkedAt: number;
  storage: StorageDiagnostics;
  pwa: PwaDiagnostics;
  database: StudyDbDiagnostics;
};

export async function loadStudyDiagnostics(): Promise<StudyDiagnosticsSnapshot> {
  const [storage, pwa, database] = await Promise.all([
    readStorageDiagnostics(),
    readPwaDiagnostics(),
    readStudyDbDiagnostics(),
  ]);

  return {
    checkedAt: Date.now(),
    storage,
    pwa,
    database,
  };
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no";
}

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) return "unknown";
  return formatBoolean(value);
}

export function formatStudyDiagnosticsReport(
  snapshot: StudyDiagnosticsSnapshot
): string {
  const { storage, pwa, database } = snapshot;
  const lines = [
    "Language Study diagnostics",
    `checkedAt=${new Date(snapshot.checkedAt).toISOString()}`,
    `secureContext=${formatBoolean(storage.secureContext)}`,
    `standalone=${formatBoolean(storage.standalone)}`,
    `storageApiSupported=${formatBoolean(storage.storageApiSupported)}`,
    `persistRequestSupported=${formatBoolean(storage.persistRequestSupported)}`,
    `persistent=${formatNullableBoolean(storage.persistent)}`,
    `usageBytes=${storage.usageBytes ?? "unknown"}`,
    `quotaBytes=${storage.quotaBytes ?? "unknown"}`,
    `serviceWorkerSupported=${formatBoolean(pwa.serviceWorkerSupported)}`,
    `controlledByServiceWorker=${formatBoolean(pwa.controlledByServiceWorker)}`,
    `registrationState=${pwa.registrationState ?? "none"}`,
    `cacheApiSupported=${formatBoolean(pwa.cacheApiSupported)}`,
    ...pwa.offlineRoutes.map(
      (route) => `offlineRoute:${route.path}=${formatBoolean(route.cached)}`
    ),
    `db.reviewItems=${database.reviewItems}`,
    `db.reviewStates=${database.reviewStates}`,
    `db.reviewEvents=${database.reviewEvents}`,
    `db.progress=${database.progress}`,
    `db.settings=${database.settings}`,
    `db.dailyStudyPlans=${database.dailyStudyPlans}`,
  ];

  return lines.join("\n");
}
