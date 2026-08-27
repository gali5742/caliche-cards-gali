# Phase 2 today review queue

This phase composes collection-scoped textbook progress, generated ReviewItems, persisted FSRS state, and the daily new-vocabulary limit into one runtime queue.

## Queue inputs

`buildTodayReviewQueue()` receives:

- current `LearningProgress`
- `VocabularyRepository`
- `ReviewRepository`
- FSRS scheduler
- current timestamp
- daily new-vocabulary limit
- optional enabled skills

`LearningProgress` includes `languageId` and `collectionId`, so the queue is built for one active content collection rather than for the whole application at once.

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

- `fr:bonjour-francais:...:gauche:recognition`
- `fr:bonjour-francais:...:gauche:production`

count together as one new vocabulary item.

The first committed review of either skill records `introducedAt` for all ReviewItems belonging to that vocabulary entry. This lets the runtime distinguish:

- vocabulary first introduced today
- vocabulary introduced on an earlier day
- vocabulary never introduced

Daily quota accounting is scoped to vocabulary unlocked in the active collection. Studying a different language or collection on the same day therefore does not consume this collection's new-vocabulary capacity.

The database uses the device's local calendar day when calculating today's introductions.

## Reopening the app does not reset the quota

Suppose the daily limit is 5 and the user completes two of the five selected new vocabulary entries, then closes and reopens the PWA.

The next queue sees two introductions already recorded today for the active collection and therefore has three slots left. Because fresh candidates are selected deterministically in textbook order, the remaining three originally selected entries are chosen again rather than exposing three additional vocabulary entries.

After five vocabulary entries have been introduced in that collection, reopening the app cannot admit a sixth new entry there that day.

## Ordering

The queue order is:

1. due items, earliest due first
2. continuation items
3. newly admitted vocabulary

For new vocabulary, recognition items are grouped before production items. This avoids the easiest form of cue leakage where a recognition prompt is immediately followed by production for the same word.

## IndexedDB

The current native database is `language-study`. Vocabulary IDs are namespaced by language and collection, so review state from different sources can coexist safely in the same database.

`upsertItems()` preserves introduction metadata, including when a new skill is enabled for vocabulary that was introduced previously.

## Current boundaries

The queue runtime still does not:

- render the mobile home page
- decide prompt mode (visual/audio/multiple-choice/typing)
- synchronize to cloud storage

LearningProgress and the settings that feed the queue are persisted above this layer.
