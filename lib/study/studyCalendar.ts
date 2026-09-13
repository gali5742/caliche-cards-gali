import { State } from "ts-fsrs";
import type { StoredReviewState } from "../repositories/reviewRepository";
import { readFsrsSchedulerState } from "../srs/fsrsMapping";

export type StudyCalendar = {
  id: "study";
  day: number;
  active: boolean;
  pausedDays: number;
};

// Calendar ordinals count local dates, including 23/25-hour DST days exactly once.
export function localDay(at: number): number {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid study timestamp");
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

export function advanceStudyCalendar(calendar: StudyCalendar, at: number): StudyCalendar {
  const day = localDay(at);
  if (day <= calendar.day) return { ...calendar };
  return {
    id: "study", day, active: false,
    pausedDays: calendar.pausedDays + day - calendar.day - Number(calendar.active),
  };
}

export function effectiveReviewDue(state: StoredReviewState, pausedDays: number): number {
  const card = readFsrsSchedulerState({ due: state.due, raw: state.state });
  if (card.state !== State.Review) return state.due;
  const days = Math.max(0, pausedDays - (state.pauseBaseline ?? 0));
  const due = new Date(state.due);
  due.setDate(due.getDate() + days);
  return due.getTime();
}
