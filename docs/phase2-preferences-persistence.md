# Phase 2 preferences persistence

This phase persists the user-facing study configuration needed by the mobile home page and review runtime.

## Learning progress

`LearningProgress` is stored per book and represents the furthest unlocked textbook position:

- book
- unit
- lesson

The application does not hardcode a personal current lesson. If no progress has been saved, the runtime returns `null` and the UI must ask the learner to choose or confirm a position.

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

`loadStudyRuntimeConfig()` combines persisted progress and settings and exposes:

- validated `LearningProgress | null`
- effective `StudySettings`
- enabled ReviewSkills
- FSRS scheduler config

When production is disabled, only `recognition` ReviewItems are generated for the active runtime. When enabled, both `recognition` and `production` are used.

The daily new-vocabulary limit feeds `buildTodayReviewQueue()`. The requested retention feeds `FsrsScheduler` configuration.

## Storage

These values live in the existing native database `bonjour-francais-review`, schema v3:

- `progress`
- `settings`

No extra preferences database is created. This keeps the new textbook runtime's local state in one database while remaining isolated from Caliche's legacy storage.
