# Phase 3 mobile home

This phase introduces the first user-facing surface for the native language-study runtime without deleting the legacy Caliche UI.

## Transition strategy

- `/study` is the new iPhone-first study home.
- `/` remains the legacy Caliche UI for compatibility and maintenance during the transition.
- the PWA manifest starts at `/study`, so an installed iPhone PWA opens the native study experience first.

The root page can be replaced later, after the native review flow is complete.

## Home data

The mobile home reads real local runtime state:

- registered content collections
- available books in the selected collection
- persisted learning progress
- persisted study settings
- FSRS-backed today queue summary

It does not use mock counters.

The visible counters are:

- due review items
- continuation items
- newly admitted vocabulary

The total study workload comes directly from the today queue runtime.

## Missing progress

Personal learning progress is not hardcoded.

If a collection has no saved progress, the home shows a setup state. The current temporary setup action explicitly initializes progress to the latest lesson that is actually registered in the repository. This is intentionally different from guessing the learner's real textbook position.

A fuller progress editor belongs in the future settings/content-management UI.

## Multiple collections

The home already supports more than one registered collection. With one collection it opens directly; with multiple collections it renders a collection selector. Book selection is shown only when a collection contains multiple registered books.

The current French textbook is therefore one content source rather than the app identity.

## PWA shell

The manifest uses the neutral working identity:

- name: `Language Study`
- short name: `Study`
- start URL: `/study`

This is a technical working name, not a final product-brand decision.

The service worker cache is renamed to `language-study-v1` and precaches both `/study` and the legacy root. Navigation caching now preserves exact routes and uses a route-aware offline fallback:

- `/study...` -> `/study`
- other routes -> `/`

## Current boundary

The primary review button is intentionally disabled in this phase. The home is connected to the real queue, but the native answer/review screen is the next implementation step. This avoids routing real FSRS work into a placeholder or legacy review flow with incompatible scheduling semantics.
