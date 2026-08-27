import { State } from "ts-fsrs";

import { readFsrsSchedulerState } from "./fsrsMapping";
import type { SchedulerState } from "./types";

export function isNewFsrsSchedulerState(state: SchedulerState): boolean {
  const card = readFsrsSchedulerState(state);
  return card.state === State.New && card.reps === 0;
}
