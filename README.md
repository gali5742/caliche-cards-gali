# Language Study

A mobile-first, local-first vocabulary review PWA built with Next.js, IndexedDB and FSRS.

The study app lives at `/study` and is designed primarily for iPhone Home Screen use. The repository was originally forked from Caliche Cards, but the current runtime no longer uses Caliche's deck model, authentication, cloud-sync backend or legacy scheduler.

## Live app

- Study app: `https://language-study-nu.vercel.app/study`
- Root `/` redirects to `/study`

All study routes are public. The active workflow is local-first and does not require an account or server-side database.

## Current study flow

The study app supports:

- textbook-aware learning progress by language, collection, book, unit and lesson
- editable learning progress from the Home screen
- deterministic textbook-order new vocabulary
- daily new-vocabulary groups, with optional same-day extra groups
- recognition review: foreign-language lemma + IPA → recall meaning
- production review: Chinese meaning → type the foreign-language lemma
- independent FSRS state for recognition and production
- four FSRS ratings: Again / Hard / Good / Easy, shown to the learner as 忘了 / 困难 / 记得 / 很熟
- read-only FSRS-weighted free-review sampling of already learned ReviewItems without changing scheduled review state
- textbook-order vocabulary browsing and local search by foreign-language form, Chinese meaning, IPA, part of speech and stored forms
- learned/all vocabulary scopes with lesson filtering
- noun gender plus notable stored inflected forms such as irregular or invariant plurals
- structured verb conjugation metadata, currently showing present indicative forms after answer reveal and in the vocabulary browser
- iPhone-first settings for group size, production review and requested retention
- offline PWA shell, IndexedDB persistence and persistent-storage diagnostics
- versioned local JSON backup with integrity validation and transactional restore

Production answer matching normalizes Unicode, apostrophes, surrounding/repeated spaces and case, but keeps accents and diacritics significant.

## Content model

The application is language-agnostic. Content identity is:

```text
languageId + collectionId
```

The currently registered collection is:

```text
fr / bonjour-francais / 你好！法语
```

Current Book 1 coverage:

- Unité 1 / Leçon 1 — complete
- Unité 1 / Leçon 2 — complete
- Unité 1 / Leçon 3 — complete
- Unité 1 / Leçon 4 — complete
- Unité 2 / Leçon 5 — complete

Lesson data is stored under `data/textbooks/` and validated at startup. Vocabulary IDs are globally namespaced by language and collection. Clearly taught lesson vocabulary may also be registered as supplemental lesson entries even when the printed `Vocabulaire` table omits it.

A vocabulary entry can contain:

```text
lemma
IPA
Chinese meanings
part of speech
grammar metadata
  gender
  stored inflected forms
  verb conjugation class
  conjugation sets and forms
examples / notes / audio reference
source coordinates
```

Verb conjugation sets are extensible. The current French textbook data stores only `présent de l'indicatif` for verbs already registered in the studied material. Adding later tenses does not require a new review-state schema.

Static grammar metadata remains part of the bundled textbook content. It is not stored in IndexedDB and does not create additional FSRS review items by itself.

## Vocabulary browser

`/study/vocabulary` is the learner-facing cumulative vocabulary list.

The default `已学` scope follows saved textbook learning progress, so advancing the current lesson automatically expands the cumulative list. This scope is based on textbook progress rather than whether an individual vocabulary item has already entered FSRS review.

The `全部` scope shows all vocabulary currently registered in the selected collection/book. Lessons whose textbook data is only partially entered are marked `当前部分`.

Search is local and works offline. It matches lemma, IPA, part of speech, Chinese meanings, tags, stored grammatical forms and verb conjugations. Searching a form such as `suis`, `sommes`, `vais` or `avons` can therefore find its infinitive entry.

Notable noun plurals are stored explicitly when they are not a plain predictable `+s` form or when the written singular/plural is invariant. Regular `+s` plurals are intentionally not duplicated in every entry.

## Scheduling model

Each vocabulary entry can generate independent review items:

```text
<vocabularyId>:recognition
<vocabularyId>:production
```

FSRS is provided by `ts-fsrs` 5.4.1.

Today's scheduled queue is composed in this order:

1. due review items
2. continuation items from vocabulary already introduced
3. fresh vocabulary within today's allowance

The daily new-word limit counts vocabulary entries rather than individual review items. Fresh recognition items are presented before fresh production items to reduce immediate answer leakage.

Same-day repeats are classified separately for learner-facing statistics without changing their FSRS scheduling state. The classification uses the current local calendar day and includes vocabulary introduced today or cards whose latest formal review occurred today.

Free review is a separate practice mode. Each session samples up to 20 eligible already-learned ReviewItems without replacement, using the existing FSRS state as read-only weighting. Due or near-due items, higher-difficulty items, lower-stability items, items with more lapses and items further through their current interval receive more weight, while stable or recently reviewed items keep a non-zero chance of selection. Recognition and production are weighted independently by their own FSRS states, and sibling skills for the same vocabulary are kept apart when alternatives are available. Advancing free review does not write FSRS state or ReviewEvent history.

Grammar details and verb conjugations are shown only after a recognition answer is revealed or a production answer is checked, so they do not act as prompt-side answer cues.

## Local data

The study runtime uses a Dexie database:

```text
language-study
```

Current schema version: `2`.

Tables:

- `reviewItems`
- `reviewStates`
- `reviewEvents`
- `progress`
- `settings`
- `dailyStudyPlans`

Scheduled review commits the next FSRS state and ReviewEvent in one IndexedDB transaction.

Changing learning progress only changes which textbook content is currently unlocked. Existing review history for temporarily hidden later lessons is retained.

### Backup and restore

`/study/data` exports the complete study database into a versioned JSON file.

Backup format:

```text
format: language-study-backup
version: 1
```

The backup includes all six study tables. Static textbook vocabulary is not duplicated because it remains part of the application bundle.

Before restore, the backup is checked for supported database version, row shape, duplicate primary records, valid current FSRS payloads and cross-table ReviewItem references. Restore then replaces all six tables inside one IndexedDB transaction. If validation or the transaction fails, the existing database is not partially replaced.

On devices that support Web Share file sharing, export opens the system share sheet; other browsers fall back to a normal JSON file download.

## PWA and offline behavior

The manifest starts at `/study` and uses the Language Study icon generated by Next routes `/icon` and `/apple-icon`.

The Service Worker caches route-specific study shells for:

- `/study`
- `/study/review`
- `/study/progress`
- `/study/vocabulary`
- `/study/settings`
- `/study/data`
- `/study/diagnostics`

Navigation is network-first with a short timeout and route-specific cached fallback for iOS offline relaunches. Non-study navigation falls back to the cached `/study` shell when the network is unavailable.

The diagnostics screen checks:

- secure context
- Home Screen / standalone mode
- Storage API availability
- persistent-storage status and request support
- storage usage and quota
- Service Worker support, control and registration state
- core offline route cache state
- local IndexedDB record counts

## Routes

```text
/                   Redirect to /study
/study              Today / Home
/study/review       Scheduled or free review
/study/progress     Learning progress
/study/vocabulary   Vocabulary browse and search
/study/settings     Study settings
/study/data         Backup and restore
/study/diagnostics  Device, storage and PWA diagnostics
```

## Architecture

The study code is separated into domain, repository, runtime and UI layers.

```text
domain/
  content/
  vocabulary/
  textbook/
  review/
  settings/
  study/

lib/
  textbook/
  vocabulary/
  repositories/
  review/
  srs/
  runtime/
  storage/
  platform/
  study/

components/study/
app/study/
data/textbooks/
tests/
```

The legacy Caliche UI, APKG runtime, authentication, MongoDB/cloud-sync routes and old scheduler/storage modules have been removed from the active codebase.

## Development

Requirements:

- Node.js 22 recommended
- npm

Install and run:

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Or run all checks:

```bash
npm run check
```

GitHub Actions runs install, lint, typecheck, regression tests and production build for pull requests targeting `master`.

The regression suite currently locks key production-answer, review-queue, local-day boundary, free-review read-only and backup-integrity behavior.

## Deployment

The production deployment is hosted on Vercel from `master`. No environment variables are required for the local-first study workflow.

## Not implemented yet

The study app does not yet provide:

- audio playback in the native review UI
- cloud synchronization
- multi-user accounts
- independent listening or spelling schedules

These are intentionally separate from the current core review and PWA persistence work.
