# Phase 2 today review queue

This phase composes textbook progress, generated ReviewItems, persisted FSRS state, and the daily new-vocabulary limit into one runtime queue.

## Queue inputs

`buildTodayReviewQueue()` receives:

- current `LearningProgress`
- `VocabularyRepository`
- `ReviewRepository`
- FSRS scheduler
- current timestamp
- daily new-vocabulary limit
- optional enabled skills

The UI does not need to understand FSRS internals to build today's work.

## Queue groups

Items are classified into three groups:

1. `due`: an already-started FSRS item that is due now
2. `continuation`: a still-New FSRS skill belonging to vocabulary that has already been introduced
3. `new`: a never-introduced vocabulary item admitted by today's new-vocabulary quota

Due and continuation work is never blocked by the daily new-vocabulary limit.

## New-vocabulary quota

The quota counts vocabulary entries, not ReviewItems.

For example, with a daily new-vocabulary limit of 5:

- `gauche:recognition`
- `gauche:production`

count together as one new vocabulary item.

The first committed review of either skill records `introducedAt` for all ReviewItems belonging to that vocabulary entry. This lets the runtime distinguish:

- vocabulary first introduced today
- vocabulary introduced on an earlier day
- vocabulary never introduced

The database uses the device's local calendar day when calculating today's introductions.

## Reopening the app does not reset the quota

Suppose the daily limit is 5 and the user completes two of the five selected new vocabulary entries, then closes and reopens the PWA.

The next queue sees two introductions already recorded today and therefore has three slots left. Because fresh candidates are selected deterministically in textbook order, the remaining three originally selected entries are chosen again rather than exposing three additional vocabulary entries.

After five vocabulary entries have been introduced, reopening the app cannot admit a sixth new entry that day.

## Ordering

The queue order is:

1. due items, earliest due first
2. continuation items
3. newly admitted vocabulary

For new vocabulary, recognition items are grouped before production items. This avoids the easiest form of cue leakage where a French-to-Chinese recognition prompt is immediately followed by Chinese-to-French production for the same word.

## IndexedDB schema

`bonjour-francais-review` advances from schema version 1 to version 2.

The only new indexed metadata is optional `introducedAt` on stored ReviewItems. Existing FSRS states and ReviewEvents are not rewritten.

`upsertItems()` preserves introduction metadata, including when a new skill is enabled for vocabulary that was introduced previously.

## Deliberate boundaries

This phase does not yet:

- render the mobile home page
- persist `LearningProgress`
- persist user settings such as the daily new limit
- add cloud sync
- decide prompt mode (visual/audio/multiple-choice/typing)

Those remain above the queue runtime.
