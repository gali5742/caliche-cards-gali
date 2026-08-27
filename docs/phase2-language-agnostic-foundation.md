# Phase 2 language-agnostic foundation

This refactor removes assumptions that the application itself is "Bonjour Français" or French-only.

## Application vs content

The application owns generic study/runtime concepts:

- content collections
- vocabulary entries
- ReviewItems
- FSRS state
- review events
- progress
- settings

`你好！法语` is one content collection:

```text
languageId:   fr
collectionId: bonjour-francais
kind:         textbook
```

The collection title may be shown in content/progress UI, but it is not the application name.

## Stable identity

Content identity is two-dimensional:

```text
languageId + collectionId
```

Vocabulary IDs add that namespace before their local textbook identity:

```text
fr:bonjour-francais:b1-u1-l4-francais
```

ReviewItem identity remains:

```text
<vocabularyId>:<skill>
```

This prevents collisions when the application later contains multiple French lists, Japanese collections, English collections, or imported/custom vocabulary.

## Grammar metadata

French-specific top-level `gender` and fixed `forms.feminine`-style typing are removed from the application domain.

Optional language-specific data now lives under:

```text
grammar.gender
grammar.forms
```

`grammar.forms` is a string map whose keys belong to the source language/collection. This lets different languages model the forms they actually need without expanding the core type for every language.

## Pronunciation

`ipa` is now optional at the generic domain level. Individual collections can require it through their own validators. The current French textbook seed continues to provide IPA.

## Progress

Textbook progress is identified by:

```text
languageId + collectionId + book
```

Book numbers are therefore local to a collection and cannot collide with another textbook.

## Storage

The native IndexedDB database is renamed from the pre-release textbook-specific name:

```text
bonjour-francais-review
```

to:

```text
language-study
```

Because there is no real user data yet, this is intentionally a clean pre-release reset rather than a migration. The new database starts at schema version 1 with all current native tables.

## Current boundary

This change makes the foundation multi-language-capable without pretending every future source must look like a textbook. The existing `TextbookLessonData` and Book/Unit/Lesson progress types remain textbook-specific by design; future custom/imported collections can add their own content/progress adapters without changing ReviewItem, FSRS, or review-history identity.
