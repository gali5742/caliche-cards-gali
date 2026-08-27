# Phase 2 preferences persistence

This phase persists the user-facing study configuration needed by the mobile home page and review runtime.

## Learning progress

`LearningProgress` is stored per language + collection + book and represents the furthest unlocked textbook position:

- `languageId`
- `collectionId`
- book
- unit
- lesson

The application does not hardcode a personal current lesson. If no progress has been saved for the active collection/book, the runtime returns `null` and the UI must ask the learner to choose or confirm a position.

## Study settings

The persisted `StudySettings` model contains:

- `dailyNewVocabularyLimit`
- `productionEnabled`
- `fsrsRequestRetention`

Default settings are application defaults rather than personal progress:

- daily new vocabulary: 5
- production: enabled
- FSRS requested retention: 0.90

Validation rules:

- daily new vocabulary: integer 0–100
- production: boolean
- requested retention: 0.70–0.99

Invalid persisted settings are rejected rather than silently coerced.

## Runtime mapping

`loadStudyRuntimeConfig()` receives a collection-scoped `progressRef` and combines persisted progress and settings into:

- validated `LearningProgress | null`
- effective `StudySettings`
- enabled ReviewSkills
- FSRS scheduler config

When production is disabled, only `recognition` ReviewItems are generated for the active runtime. When enabled, both `recognition` and `production` are used.

The daily new-vocabulary limit feeds `buildTodayReviewQueue()`. The requested retention feeds `FsrsScheduler` configuration.

## Storage

These values live in the native `language-study` database:

- `progress`
- `settings`

No textbook-specific preferences database is created. This keeps local study state in one application-level database while remaining isolated from Caliche's legacy storage.
