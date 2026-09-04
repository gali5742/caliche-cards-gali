export const STUDY_OPPORTUNITY_BACKGROUND_GAP_MS = 30 * 60 * 1000;
export const STUDY_OPPORTUNITY_CHANGED_EVENT =
  "language-study:study-opportunity-changed";

const OPPORTUNITY_STARTED_AT_KEY =
  "language-study.study-opportunity.started-at.v1";
const OPPORTUNITY_HIDDEN_AT_KEY =
  "language-study.study-opportunity.hidden-at.v1";

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null;
}

function readSessionTimestamp(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    return parseTimestamp(window.sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeSessionTimestamp(key: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, String(value));
  } catch {
    // A restricted browser context may not expose sessionStorage.
  }
}

function removeSessionTimestamp(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // A restricted browser context may not expose sessionStorage.
  }
}

function isSameLocalCalendarDay(a: number, b: number): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function shouldStartNewStudyOpportunity(
  hiddenAt: number | null,
  visibleAt: number,
  minimumBackgroundGap = STUDY_OPPORTUNITY_BACKGROUND_GAP_MS
): boolean {
  if (hiddenAt === null) return false;
  if (!Number.isFinite(hiddenAt) || !Number.isFinite(visibleAt)) return false;
  if (!Number.isFinite(minimumBackgroundGap) || minimumBackgroundGap < 0) {
    return false;
  }
  return visibleAt >= hiddenAt && visibleAt - hiddenAt >= minimumBackgroundGap;
}

export function getStudyOpportunityStartedAt(now: number): number {
  if (!Number.isFinite(now)) {
    throw new Error("Cannot resolve a study opportunity for an invalid timestamp");
  }

  if (typeof window === "undefined") return now;

  const stored = readSessionTimestamp(OPPORTUNITY_STARTED_AT_KEY);
  if (
    stored !== null &&
    stored <= now &&
    isSameLocalCalendarDay(stored, now)
  ) {
    return stored;
  }

  writeSessionTimestamp(OPPORTUNITY_STARTED_AT_KEY, now);
  return now;
}

export function markStudyOpportunityHidden(at: number): void {
  if (!Number.isFinite(at)) return;
  writeSessionTimestamp(OPPORTUNITY_HIDDEN_AT_KEY, at);
}

export function resumeStudyOpportunity(at: number): {
  startedAt: number;
  startedNew: boolean;
} {
  const previousStartedAt = readSessionTimestamp(OPPORTUNITY_STARTED_AT_KEY);
  const current = getStudyOpportunityStartedAt(at);
  const hiddenAt = readSessionTimestamp(OPPORTUNITY_HIDDEN_AT_KEY);
  removeSessionTimestamp(OPPORTUNITY_HIDDEN_AT_KEY);

  const dayRolled =
    previousStartedAt !== null && previousStartedAt !== current;
  const backgroundGapElapsed = shouldStartNewStudyOpportunity(hiddenAt, at);

  if (!dayRolled && !backgroundGapElapsed) {
    return { startedAt: current, startedNew: false };
  }

  writeSessionTimestamp(OPPORTUNITY_STARTED_AT_KEY, at);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STUDY_OPPORTUNITY_CHANGED_EVENT));
  }
  return { startedAt: at, startedNew: true };
}
