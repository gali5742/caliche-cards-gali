# Phase 3 native review flow

This phase connects the mobile home page to the native ReviewItem + FSRS runtime.

## Route

The native review route is:

`/study/review?language=<languageId>&collection=<collectionId>&book=<book>`

The target collection and book are carried in the URL so the review page does not rely on a French-only singleton or hidden global selection.

## Recognition

Recognition uses the `recall` ReviewEvent mode.

Flow:

1. show the vocabulary lemma and IPA when available
2. learner recalls the meaning
3. reveal the Chinese meaning and part of speech
4. learner rates the memory as Again / Hard / Good / Easy
5. the new FSRS state and ReviewEvent are committed atomically through the native repository

## Production

Production uses the `typing` ReviewEvent mode.

Flow:

1. show the Chinese meaning
2. ask for the vocabulary lemma / dictionary form
3. use the native mobile text keyboard
4. compare the typed answer with the lemma
5. reveal the expected lemma and IPA
6. learner rates the memory as Again / Hard / Good / Easy
7. commit the new FSRS state and ReviewEvent

The first production version deliberately asks for the lemma rather than accepting every grammatical form. This avoids ambiguous prompts such as adjective/noun entries where masculine and feminine forms may both be semantically valid.

## Production answer normalization

Typing comparison currently normalizes only:

- Unicode compatibility form (NFKC)
- case
- leading/trailing whitespace
- repeated internal whitespace
- typographic apostrophes to straight apostrophe

It deliberately does not remove diacritics or expand ligatures. For example, accented spelling remains part of correctness.

## Session behavior

The queue is snapshotted when the review route opens. Each rating advances to the next item in that snapshot.

Short-term FSRS items that become due after the session started are not injected into the middle of the current round. They will appear when the home queue is refreshed or a later review session is opened.

## Offline shell

The service worker now includes `/study/review` as a study shell and the route reads its target from the client URL. This improves route-level offline fallback. Full cold-start iPhone validation still needs physical-device testing, especially route chunks, IndexedDB persistence, lock/unlock, and Safari storage pressure.

## Still deferred

This phase does not add:

- audio prompting or autoplay
- multiple choice
- independent listening/spelling schedules
- automatic rating based on typing correctness
- settings UI
- backup/restore
- physical iPhone offline validation
