# Phase 1 review item generation

The native content path derives review work from semantic vocabulary entries instead of Anki-shaped cards.

## Current policy

Each unlocked `VocabularyEntry` generates two independent `ReviewItem`s by default:

- `recognition`: source-language form -> Chinese meaning
- `production`: Chinese meaning -> source-language form

Listening and spelling are currently presentation/question modes, not independent scheduling skills.

## Stable identity

Review item ids are deterministic:

```text
<vocabularyId>:<skill>
```

Vocabulary IDs themselves are namespaced by language and collection, so ReviewItem IDs are globally safe as more collections are added.

Example:

```text
fr:bonjour-francais:b1-u1-l4-francais:recognition
fr:bonjour-francais:b1-u1-l4-francais:production
```

Changing IPA, meaning, examples, or tags does not change scheduling identity. Changing the vocabulary id or skill does.

## Progress boundary

`generateUnlockedReviewItems()` asks `VocabularyRepository.listUnlocked()` for entries within the active `languageId + collectionId` at or before the current textbook progress and then performs pure item generation.

No database writes or scheduler state creation happen in this layer. Persistence and FSRS initialization belong to later phases.
