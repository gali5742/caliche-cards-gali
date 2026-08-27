# Phase 0 architecture

This branch introduces architectural seams for the French textbook vocabulary project without changing current Caliche Cards behavior.

## Boundaries

- `domain/`: application concepts independent from storage/UI.
- `lib/repositories/`: persistence contracts used by future features.
- `lib/srs/`: scheduler abstraction; the legacy scheduler remains active in Phase 0.
- `lib/storage/`: future storage consolidation boundary.
- `lib/importers/anki/`: compatibility adapter around the existing `.apkg` importer.

## Phase 0 rules

1. Do not replace the current scheduler yet.
2. Do not change the existing IndexedDB schemas yet.
3. Do not change the current UI or review flow.
4. Do not migrate existing cards into textbook vocabulary entries yet.
5. New French-specific work should target these boundaries instead of adding more responsibilities to `app/page.tsx` or `lib/studyApi.ts`.

The next phase can add a real textbook vocabulary repository and FSRS adapter behind these interfaces while the legacy app remains usable.
