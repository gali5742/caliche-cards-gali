# Phase 1 review item generation

The native textbook path now derives review work from semantic vocabulary entries instead of Anki-shaped cards.

## Current policy

Each unlocked `VocabularyEntry` generates two independent `ReviewItem`s by default:

- `recognition`: French -> meaning
- `production`: meaning -> French

Listening and spelling are currently presentation/question modes, not independent scheduling skills.

## Stable identity

Review item ids are deterministic:

```text
<vocabularyId>:<skill>
```

Example:

```text
b1-u1-l4-francaise:recognition
b1-u1-l4-francaise:production
```

Changing IPA, meaning, examples, or tags does not change scheduling identity. Changing the vocabulary id or skill does.

## Progress boundary

`generateUnlockedReviewItems()` asks `VocabularyRepository.listUnlocked()` for entries at or before the current textbook progress and then performs pure item generation.

No database writes or scheduler state creation happen in this layer. Persistence and FSRS initialization belong to later phases.
