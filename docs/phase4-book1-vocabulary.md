# Phase 4 Book 1 learned vocabulary

This phase replaces the six-entry seed with the learner's actual covered vocabulary from 《你好！法语》 Book 1.

## Source boundary

The source is the user-provided scan of 《你好！法语①》.

Registered coverage:

- Unité 1 · Leçon 1: complete vocabulary table (printed p.23 / scan `v1-page-025.jpg`)
- Unité 1 · Leçon 2: complete vocabulary table (printed p.27 / scan `v1-page-029.jpg`)
- Unité 1 · Leçon 3: complete vocabulary table (printed p.31 / scan `v1-page-033.jpg`)
- Unité 1 · Leçon 4: complete vocabulary table (printed p.35 / scan `v1-page-037.jpg`)
- Unité 2 · Leçon 5: partial, matching the currently studied portion through `pièce /pjɛs/`, plus `sur /syʁ/` and `sous /su/` because they already occur in the lesson dialogue/exercises

Later Leçon 5 vocabulary such as `pomme /pɔm/` and subsequent entries is deliberately not registered yet.

## Counts

Current registered vocabulary entries:

- Leçon 1: 26
- Leçon 2: 31
- Leçon 3: 37
- Leçon 4: 27
- Leçon 5 partial: 35
- total: 156

Every registered entry currently has IPA so the mobile review UI can keep pronunciation visible.

## Cross-lesson vocabulary policy

The collection avoids creating duplicate ReviewItems for the same learned lexical item merely because the textbook lists another sense later.

Examples:

- `français /fʁɑ̃.sɛ/` is stored once from its first occurrence and includes the learned nationality/person/language meanings.
- `espagnol /ɛs.pa.ɲɔl/` is stored once and includes adjective, person, and language meanings learned across Unité 1.
- `avec /a.vɛk/` remains one vocabulary identity while its learned meanings include both accompaniment and possession/attribute uses.

This prevents identical prompts from creating separate FSRS histories with conflicting answer sets.

## Schema v3

Lesson JSON now uses `schemaVersion: 3`.

Shared source coordinates live once at the lesson-file level. `validateLessonData()` injects the canonical textbook `source` into runtime `VocabularyEntry` objects, so source metadata is not copied into every raw entry.

Each lesson also declares:

```text
coverage: complete | partial
```

This lets a partially studied lesson be represented without pretending that all of its vocabulary has already been learned.

## Identity safety

`lib/textbook/registry.ts` now checks duplicate lesson coordinates and duplicate vocabulary IDs across all registered lessons during application startup/build.
