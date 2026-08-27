# Phase 2 review persistence

This phase persists the native review runtime without modifying Caliche's legacy study database.

## Database

The native runtime uses one language-agnostic Dexie database:

- name: `language-study`
- schema version: `1`

This database name replaces the earlier pre-release `bonjour-francais-review` name. No migration is provided because the application has not entered real use yet; resetting now avoids carrying a textbook-specific storage identity forward.

Tables:

- `reviewItems`: stable derived review identities and enabled state
- `reviewStates`: one independent FSRS state per ReviewItem
- `reviewEvents`: append-only review history
- `progress`: persisted textbook learning position, keyed by language + collection + book
- `settings`: persisted study settings

Vocabulary content is not copied into this database. `VocabularyEntry` remains owned by the content data layer.

## State ownership

Each ReviewItem owns exactly one scheduling state. For example:

- `fr:bonjour-francais:b1-u1-l4-francais:recognition`
- `fr:bonjour-francais:b1-u1-l4-francais:production`

These rows can therefore diverge in due date, stability, difficulty, repetitions, and lapses while remaining collision-safe across collections and languages.

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

Existing progress is therefore preserved when content data is reloaded.

## Deliberate boundaries

The native database remains physically separate from Caliche's legacy IndexedDB databases. This phase does not migrate legacy `cardStates`, merge legacy databases, or add cloud synchronization.
