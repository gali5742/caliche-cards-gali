const STORAGE_KEY = "language-study.practice-exposure.v1";
const STORAGE_VERSION = 1;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export type PracticeExposure = {
  count: number;
  lastShownAt: number;
};

type PracticeExposureEnvelope = {
  version: 1;
  dayKey: string;
  entries: Record<string, PracticeExposure>;
};

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPracticeExposure(value: unknown): value is PracticeExposure {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PracticeExposure>;
  return (
    Number.isInteger(candidate.count) &&
    Number(candidate.count) > 0 &&
    Number.isFinite(candidate.lastShownAt)
  );
}

function readEnvelope(now: number): PracticeExposureEnvelope {
  const empty: PracticeExposureEnvelope = {
    version: STORAGE_VERSION,
    dayKey: localDayKey(now),
    entries: {},
  };
  const storage = getStorage();
  if (!storage) return empty;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PracticeExposureEnvelope>;
    if (
      parsed.version !== STORAGE_VERSION ||
      parsed.dayKey !== empty.dayKey ||
      !parsed.entries ||
      typeof parsed.entries !== "object"
    ) {
      return empty;
    }

    const entries: Record<string, PracticeExposure> = {};
    for (const [itemId, exposure] of Object.entries(parsed.entries)) {
      if (isPracticeExposure(exposure)) entries[itemId] = exposure;
    }

    return { ...empty, entries };
  } catch {
    return empty;
  }
}

export function readPracticeExposureSnapshot(
  now: number
): Record<string, PracticeExposure> {
  return readEnvelope(now).entries;
}

export function recordPracticeExposure(itemId: string, shownAt: number): void {
  if (!itemId) return;
  const storage = getStorage();
  if (!storage) return;

  const envelope = readEnvelope(shownAt);
  const previous = envelope.entries[itemId];
  envelope.entries[itemId] = {
    count: (previous?.count ?? 0) + 1,
    lastShownAt: shownAt,
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Exposure cooling is best-effort and must never block free review.
  }
}

export function practiceExposureMultiplier(
  exposure: PracticeExposure | undefined,
  now: number
): number {
  if (!exposure) return 1;

  const countFactor =
    exposure.count <= 1 ? 0.35 : exposure.count === 2 ? 0.15 : 0.05;
  const ageMs = Math.max(0, now - exposure.lastShownAt);

  let recencyFactor = 1;
  if (ageMs < 30 * MINUTE_MS) {
    recencyFactor = 0.1;
  } else if (ageMs < HOUR_MS) {
    recencyFactor = 0.25;
  } else if (ageMs < 3 * HOUR_MS) {
    recencyFactor = 0.6;
  }

  return countFactor * recencyFactor;
}
