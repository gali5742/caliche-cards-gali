# Phase 2 FSRS core

The native textbook review path now uses `ts-fsrs` 5.4.1 behind the application's scheduler boundary.

## Dependency policy

- Stable `ts-fsrs` 5.4.1 is pinned exactly.
- The 6.x line is still beta and is not used.
- Node.js 20+ is required by `ts-fsrs`; repository CI already runs on Node 20.

## State boundary

`ts-fsrs` works with JavaScript `Date` values. Persistent application state does not.

`fsrsMapping.ts` is the only place that converts between:

- `ts-fsrs` `Card` values with `Date`
- serializable millisecond-based `SerializedFsrsCard` values
- the generic `SchedulerState` wrapper

Serialized payloads include `kind: "fsrs"` and `version: 1` so future migrations can reject or upgrade incompatible state explicitly.

## Independent skills

Each `ReviewItem` owns its own stored scheduler state. For example:

- `b1-u1-l4-francaise:recognition`
- `b1-u1-l4-francaise:production`

The two items therefore have independent due dates, stability, difficulty, repetition counts, and lapse counts.

## Ratings

Application ratings map directly to FSRS grades:

- `again` -> `Rating.Again`
- `hard` -> `Rating.Hard`
- `good` -> `Rating.Good`
- `easy` -> `Rating.Easy`

The scheduler also exposes four-way preview state for future rating-button interval labels.

## Defaults

Current application defaults are:

- desired retention: 0.90
- maximum interval: 36500 days
- fuzz: enabled
- short-term scheduling: enabled
- learning/relearning steps: `ts-fsrs` defaults unless explicitly configured

These will become user settings later; they are not UI controls in this phase.

## Not included yet

This phase does not:

- persist the new review state to a new IndexedDB schema
- replace the legacy Caliche review runtime
- connect textbook ReviewItems to the mobile review UI
- generate ReviewEvents during UI review
- optimize FSRS parameters from history
