# Phase 3 mobile study settings

This phase exposes the native study settings through an iPhone-first `/study/settings` screen.

## Editable settings

The page edits the existing persisted `StudySettings` model:

- `dailyNewVocabularyLimit`
- `productionEnabled`
- `fsrsRequestRetention`

No new settings model or duplicate persistence path is introduced.

## Save behavior

Settings are loaded from `IndexedDbSettingsRepository` through the study-settings runtime.

Changes remain local to the form until the learner taps **保存设置**. This avoids repeated IndexedDB writes while dragging the FSRS retention slider.

**恢复默认值** restores the application defaults in the current form only; the defaults are persisted only after an explicit save.

## Daily new vocabulary

The UI accepts an integer from 0 to 100.

This value only limits never-introduced vocabulary. Due reviews and continuation work remain eligible regardless of the daily new-vocabulary limit.

## Production

The Production switch controls whether new runtime generation uses:

- recognition only, or
- recognition + production

Existing FSRS state is not deleted when Production is disabled. Re-enabling it allows the deterministic ReviewItem ids to reconnect to their prior persisted state.

## FSRS retention

The UI exposes the current supported range of 70% to 99% in 1 percentage-point steps.

A higher requested retention generally creates more frequent review; a lower requested retention permits longer intervals.

The saved setting applies the next time a study queue / review runtime creates an `FsrsScheduler`. An already-open review session is not mutated underneath the learner.

## Navigation and offline behavior

The mobile home page now includes a settings shortcut. `/study/settings` is included in the service-worker precache and has its own route-specific offline shell.

## Deliberate boundaries

This phase does not yet add:

- learning-progress editing
- audio preferences
- backup / restore
- cloud sync settings
- per-language or per-collection setting overrides

Study settings remain application-wide for now.
