# Phase 2 review persistence

This phase persists the new textbook review runtime without modifying Caliche's legacy study database.

## Database

The native textbook runtime uses one separate Dexie database:

- name: `bonjour-francais-review`
- current schema version: `3`

Schema history:

- v1: `reviewItems`, `reviewStates`, `reviewEvents`
- v2: adds `introducedAt` metadata for daily new-vocabulary accounting
- v3: adds `progress` and `settings`

Current tables:

- `reviewItems`: stable derived review identities and enabled state
- `reviewStates`: one independent FSRS state per ReviewItem
- `reviewEvents`: append-only review history
- `progress`: persisted textbook learning position, keyed by book
- `settings`: persisted study settings

Textbook vocabulary content is not copied into this database. `VocabularyEntry` remains owned by the native textbook data layer.

## State ownership

Each ReviewItem owns exactly one scheduling state. For example:

- `b1-u1-l4-francaise:recognition`
- `b1-u1-l4-francaise:production`

These rows can therefore diverge in due date, stability, difficulty, repetitions, and lapses.

## Review transaction

A completed answer writes two things:

1. the newly scheduled FSRS state
2. an append-only ReviewEvent

`IndexedDbReviewRepository.commitReview()` writes both in one Dexie transaction. A crash or app suspension cannot leave a successfully committed new state without its corresponding event, or vice versa.

## Initialization

`ensureReviewItems()`:

1. upserts generated ReviewItems
2. loads existing states
3. creates an initial FSRS state only for items that do not have one

Existing progress is therefore preserved when textbook data is reloaded.

## Deliberate boundaries

The native database remains physically separate from Caliche's legacy IndexedDB databases. This phase does not migrate legacy `cardStates`, merge legacy databases, or add cloud synchronization.
