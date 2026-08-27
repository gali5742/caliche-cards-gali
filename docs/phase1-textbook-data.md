# Phase 1 textbook semantic data layer

This phase introduces native textbook vocabulary data independent from Caliche/Anki card HTML.

## Source layout

Textbook vocabulary is stored by book, unit, and lesson under:

`data/textbooks/bonjour-francais/book-XX/unit-XX/lesson-XX.json`

Each lesson declares its own source coordinates and contains semantic `VocabularyEntry` records. The initial seed uses a small set from Book 1, Unité 1, Leçon 4 so the data path can be validated before bulk transcription.

## Runtime path

1. Static lesson JSON is imported by `lib/textbook/registry.ts`.
2. `validateLessonData` rejects malformed lesson files, mismatched source coordinates, or duplicate IDs.
3. `StaticVocabularyRepository` exposes the repository interface used by future application code.

The current Caliche UI and scheduler do not use this data yet. This phase deliberately avoids any review behavior change.

## Data principles

- textbook content is authoritative semantic data, not `frontHtml/backHtml/fieldsHtml[]`
- scheduling state never belongs in textbook JSON
- one lesson per source file
- IDs remain stable after publication
- bulk transcription should happen only after the schema and query path are proven
