# Phase 0 legacy adapters

These adapters isolate Caliche's existing implementation behind explicit seams before any behavioral migration.

- `LegacyStudyApiAdapter` wraps the current study API (`overview`, `next`, `answer`).
- `LegacyStudyStorageAdapter` wraps the existing Dexie database lifecycle.
- `LegacySchedulerAdapter` wraps the current pass/fail scheduler behind the future scheduler interface.

Important limitations:

- The legacy scheduler is still pass/fail. `again` maps to fail; `hard`, `good`, and `easy` all map to pass.
- No UI path uses these adapters yet, so current application behavior remains unchanged.
- These adapters are transitional and will be removed after the new textbook/review model and FSRS implementation own the runtime path.
