# Phase 1 textbook semantic data layer

This phase introduces native textbook vocabulary data independent from Caliche/Anki card HTML.

## Source layout

Textbook vocabulary is stored by collection, book, unit, and lesson under paths such as:

`data/textbooks/bonjour-francais/book-XX/unit-XX/lesson-XX.json`

A textbook is one content collection, not the identity of the application. Each lesson declares:

- `languageId`
- `collectionId`
- book / unit / lesson coordinates
- `coverage`: `complete` or `partial`
- semantic vocabulary records

Schema v3 keeps shared lesson coordinates at the lesson-file level. Individual raw entries do not repeat the same `source` object; `validateLessonData()` injects the canonical textbook source into each runtime `VocabularyEntry`.

## Runtime path

1. Static lesson JSON is imported by `lib/textbook/registry.ts`.
2. `validateLessonData` rejects malformed lesson files, invalid coverage, mismatched explicit source coordinates, duplicate IDs, or IDs without a language/collection namespace.
3. The validator injects the lesson source coordinates into each runtime `VocabularyEntry`.
4. `StaticVocabularyRepository` exposes the repository interface used by application code.

## Data identity

Vocabulary IDs are globally namespaced:

```text
<languageId>:<collectionId>:<localId>
```

Example:

```text
fr:bonjour-francais:b1-u1-l1-francais
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
- lesson-level source coordinates are written once, not repeated per entry
- `coverage: partial` allows the repository to represent the learner's current partially studied lesson without unlocking later vocabulary
- collection identity is separate from application identity
- IDs remain stable after publication
