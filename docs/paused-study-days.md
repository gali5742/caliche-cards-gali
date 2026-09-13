# Paused study days

A successful formal review commit marks its local calendar date active. Opening,
searching, revealing an answer, and free practice do not. Only fully ended dates
without a commit count as paused; today is never counted before its midnight.

The database stores one calendar row (current local date ordinal, active flag,
cumulative paused days) and one pauseBaseline per review state. Queue reads settle
elapsed dates in a serialized IndexedDB transaction without marking activity.
Formal commits settle the calendar, mark activity, save the new baseline and FSRS
state, and append the event in the same transaction. Failed commits mark nothing.

For long-term Review, availability and sorting use the original FSRS due shifted
by cumulative paused days minus that card's baseline, using local calendar-day
arithmetic. The stored FSRS payload, last_review and elapsed memory time remain
real timestamps. A new formal review schedules from its actual reviewedAt and
resets the baseline. New states take the current baseline when persisted.

Learning/Relearning and unfinished sibling skills remain available under the
existing Study Opportunity rules, once per opportunity, without generating copies
for missed dates. New-word capacity stays a per-local-date limit, not a balance.
The frontend introduces no new concepts.

Schema v3 retains v1/v2 schemas and adds studyCalendar. Existing card baselines
start at zero; the calendar starts at the latest persisted formal event's local
date (active), or today (inactive) when there are no events. Thus the current
absence since the last legacy review is recognized; earlier legacy scheduling
history is not rewritten. Backup format v1 remains readable, with dbVersion 3
carrying the calendar and baselines. Legacy restores initialize identically.
Exports are consistent read transactions and restores are validated atomic writes.

Dates follow the device's local timezone. Calendar arithmetic handles DST days;
a backwards date never reduces accumulated pauses, and formal submissions before
the already settled date are rejected rather than corrupting the calendar.
