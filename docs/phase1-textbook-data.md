# Phase 1 textbook semantic data layer

This phase introduces native textbook vocabulary data independent from Caliche/Anki card HTML.

## Source layout

Textbook vocabulary is stored by collection, book, unit, and lesson under paths such as:

`data/textbooks/bonjour-francais/book-XX/unit-XX/lesson-XX.json`

A textbook is one content collection, not the identity of the application. Each lesson declares:

- `languageId`
- `collectionId`
- book / unit / lesson coordinates
- semantic `VocabularyEntry` records

The initial seed uses a small set from the French collection `bonjour-francais`, Book 1, Unité 1, Leçon 4 so the data path can be validated before bulk transcription.

## Runtime path

1. Static lesson JSON is imported by `lib/textbook/registry.ts`.
2. `validateLessonData` rejects malformed lesson files, mismatched collection/source coordinates, duplicate IDs, or IDs without a language/collection namespace.
3. `StaticVocabularyRepository` exposes the repository interface used by application code.

## Data identity

Vocabulary IDs are globally namespaced:

```text
<languageId>:<collectionId>:<localId>
```

Example:

```text
fr:bonjour-francais:b1-u1-l4-francais
```

This prevents collisions when additional French collections or entirely different languages are added later.

## Language-specific grammar

Language-specific morphology is not encoded as French-only top-level fields. Optional grammar metadata lives under:

```text
grammar.gender
grammar.forms
```

The keys/values are collection data, so another language can use its own gender system or form names without changing the application domain model.

## Data principles

- textbook content is authoritative semantic data, not `frontHtml/backHtml/fieldsHtml[]`
- scheduling state never belongs in textbook JSON
- one lesson per source file
- collection identity is separate from application identity
- IDs remain stable after publication
- bulk transcription should happen only after the schema and query path are proven
