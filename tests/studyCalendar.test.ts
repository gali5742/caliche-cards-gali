import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import Dexie from "dexie";
import { State, createEmptyCard } from "ts-fsrs";
import { LanguageStudyDb, STUDY_DB_NAME } from "../lib/storage/studyDb";
import { IndexedDbReviewRepository } from "../lib/repositories/indexedDbReviewRepository";
import { toSchedulerState, readFsrsSchedulerState } from "../lib/srs/fsrsMapping";
import { FsrsScheduler } from "../lib/srs/fsrsAdapter";
import { recordReview } from "../lib/review/reviewPersistenceService";
import { buildTodayReviewQueue } from "../lib/review/todayReviewQueue";
import { buildReviewItemId } from "../lib/review/reviewItemGenerator";
import { advanceStudyCalendar, effectiveReviewDue, localDay } from "../lib/study/studyCalendar";
import { createStudyBackup, parseStudyBackup, restoreStudyBackup } from "../lib/storage/studyBackup";
import type { VocabularyEntry } from "../domain/vocabulary/types";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).getTime();
const scheduler = new FsrsScheduler({ enableFuzz: false });
const entries: VocabularyEntry[] = Array.from({ length: 6 }, (_, i) => ({
  id: `word${i}`, lemma: `word${i}`, meaningsZh: ["词"], partOfSpeech: "nom",
  source: { kind: "textbook", languageId: "fr", collectionId: "test", book: 1, unit: 1, lesson: 1 },
}));
const item = (i: number) => ({ id: buildReviewItemId(entries[i].id, "recognition"), vocabularyId: entries[i].id, skill: "recognition" as const, enabled: true });
async function fresh() {
  await Dexie.delete(STUDY_DB_NAME);
  const db = new LanguageStudyDb();
  const repo = new IndexedDbReviewRepository(db);
  return { db, repo };
}
async function seed(repo: IndexedDbReviewRepository, i: number, due: number, state = State.Review) {
  await repo.upsertItems([item(i)]);
  const card = { ...createEmptyCard(new Date(due)), state, reps: 1, last_review: new Date(at(1)), stability: 3, difficulty: 5 };
  const raw = toSchedulerState(card);
  await repo.saveState({ reviewItemId: item(i).id, due, state: raw.raw });
}
function queue(repo: IndexedDbReviewRepository, now: number) {
  return buildTodayReviewQueue({
    progress: { languageId: "fr", collectionId: "test", book: 1, unlockedThrough: { unit: 1, lesson: 1 } },
    vocabularyRepository: { getById: async id => entries.find(e => e.id === id) ?? null,
      listByLesson: async () => entries, listUnlocked: async () => entries, search: async () => entries },
    reviewRepository: repo, scheduler, now, opportunityStartedAt: now, dailyNewVocabularyLimit: 2, skills: ["recognition"],
  });
}

test("single and consecutive absences shift existing Review without accumulating new words or reinforcement", async () => {
  const { db, repo } = await fresh();
  try {
    await repo.prepareStudyCalendar(at(1));
    await seed(repo, 0, at(2));
    await seed(repo, 1, at(3));
    await seed(repo, 2, at(1), State.Learning);
    await db.studyCalendar.update("study", { active: true });
    const before = await queue(repo, at(1));
    assert.equal(before.summary.newVocabulary, 2);
    for (const day of [3, 6]) {
      const q = await queue(repo, at(day));
      assert.deepEqual(q.entries.filter(e => e.kind === "due").map(e => e.item.id), [item(2).id, item(0).id]);
      assert.equal(q.summary.pendingReinforcementVocabulary, 1);
      assert.equal(q.summary.newVocabulary, 2);
      assert.equal((await db.studyCalendar.get("study"))?.pausedDays, day - 2);
    }
  } finally { db.close(); }
});

test("opening only does not mark active; midnight settles only complete local dates", async () => {
  const { db, repo } = await fresh();
  try {
    await queue(repo, at(1, 23));
    assert.equal((await db.studyCalendar.get("study"))?.active, false);
    assert.equal(await repo.prepareStudyCalendar(at(2, 0)), 1);
    assert.equal(await repo.prepareStudyCalendar(at(2, 23)), 1);
    await recordReview({ item: item(0), rating: "good", mode: "recall", reviewedAt: at(2, 23) }, repo, scheduler);
    assert.equal(await repo.prepareStudyCalendar(at(3, 0)), 1);
    assert.equal(await repo.prepareStudyCalendar(at(5, 0)), 3);
  } finally { db.close(); }
});

test("formal review resets baseline, preserves real FSRS time, and failed commits roll back activity", async () => {
  const { db, repo } = await fresh();
  try {
    await repo.prepareStudyCalendar(at(1));
    await seed(repo, 0, at(2));
    const result = await recordReview({ item: item(0), rating: "good", mode: "recall", reviewedAt: at(5), eventId: "one" }, repo, scheduler);
    const stored = (await repo.getState(item(0).id))!;
    assert.equal(stored.pauseBaseline, 4);
    assert.equal(effectiveReviewDue(stored, 4), result.state.due);
    assert.equal(readFsrsSchedulerState({ due: stored.due, raw: stored.state }).last_review?.getTime(), at(5));
    assert.equal(await repo.prepareStudyCalendar(at(6)), 4);
    await assert.rejects(recordReview({ item: item(0), rating: "good", mode: "recall", reviewedAt: at(6), eventId: "one" }, repo, scheduler));
    assert.equal((await db.studyCalendar.get("study"))?.active, false);
    assert.equal(await repo.prepareStudyCalendar(at(7)), 5);
    const expected = new Date(result.state.due); expected.setDate(expected.getDate() + 1);
    assert.equal(effectiveReviewDue((await repo.getState(item(0).id))!, 5), expected.getTime());
  } finally { db.close(); }
});

test("v2 migration and backup round-trip retain schedules and pause baselines; legacy restore initializes calendar", async () => {
  await Dexie.delete(STUDY_DB_NAME);
  const old = new Dexie(STUDY_DB_NAME);
  old.version(2).stores({ reviewItems: "id, vocabularyId, skill, enabled, introducedAt", reviewStates: "reviewItemId, due", reviewEvents: "id, reviewItemId, reviewedAt, [reviewItemId+reviewedAt]", progress: "id, [languageId+collectionId+book]", settings: "id", dailyStudyPlans: "id, [languageId+collectionId+book+localDate]" });
  await old.table("reviewItems").put({ ...item(0), updatedAt: at(1) });
  await old.table("reviewEvents").put({ id: "old", reviewItemId: item(0).id, rating: "good", mode: "recall", reviewedAt: at(1), createdAt: at(1) });
  const legacyState = toSchedulerState({ ...createEmptyCard(new Date(at(2))), state: State.Review, reps: 1, last_review: new Date(at(1)) });
  await old.table("reviewStates").put({ reviewItemId: item(0).id, due: legacyState.due, state: legacyState.raw, updatedAt: at(1) });
  old.close();
  const db = new LanguageStudyDb(); const repo = new IndexedDbReviewRepository(db);
  try {
    assert.equal(await repo.prepareStudyCalendar(at(4)), 2);
    assert.equal((await repo.getState(item(0).id))?.pauseBaseline ?? 0, 0);
    assert.equal(effectiveReviewDue((await repo.getState(item(0).id))!, 2), at(4));
    await seed(repo, 0, at(6));
    const backup = parseStudyBackup(JSON.parse(JSON.stringify(await createStudyBackup(db))));
    await restoreStudyBackup(backup, db);
    assert.equal((await repo.getState(item(0).id))?.pauseBaseline, 2);
    assert.equal(await repo.prepareStudyCalendar(at(5)), 3);
    const invalid = structuredClone(backup); invalid.data.reviewStates[0].pauseBaseline = 100;
    assert.throws(() => parseStudyBackup(invalid), /baseline/);
    const legacy = structuredClone(backup); legacy.dbVersion = 2;
    delete legacy.data.studyCalendar;
    delete legacy.data.reviewStates[0].pauseBaseline;
    await restoreStudyBackup(legacy, db);
    assert.equal(await repo.prepareStudyCalendar(at(4)), 2);
    assert.equal((await repo.getState(item(0).id))?.pauseBaseline ?? 0, 0);
    assert.equal(effectiveReviewDue((await repo.getState(item(0).id))!, 2), at(8));
  } finally { db.close(); }
});

test("local calendar arithmetic counts DST boundaries as one date and ignores backwards clocks", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const start = new Date(2026, 2, 7, 12).getTime();
    const end = new Date(2026, 2, 9, 12).getTime();
    assert.equal(end - start, 47 * 3600000);
    const calendar = { id: "study" as const, day: localDay(start), active: true, pausedDays: 0 };
    assert.equal(advanceStudyCalendar(calendar, end).pausedDays, 1);
    assert.deepEqual(advanceStudyCalendar(calendar, start - 86400000), calendar);
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});


test("concurrent queue reads settle absence once and newly created cards inherit the current baseline", async () => {
  const { db, repo } = await fresh();
  try {
    await repo.prepareStudyCalendar(at(1));
    const counts = await Promise.all(Array.from({ length: 5 }, () => repo.prepareStudyCalendar(at(5))));
    assert.deepEqual(counts, [4, 4, 4, 4, 4]);
    await seed(repo, 0, at(6));
    const stored = (await repo.getState(item(0).id))!;
    assert.equal(stored.pauseBaseline, 4);
    assert.equal(effectiveReviewDue(stored, 4), at(6));
    await seed(repo, 1, at(1), State.Relearning);
    const q = await queue(repo, at(5));
    assert.equal(q.entries.filter(e => e.item.id === item(1).id).length, 1);
    assert.equal(q.entries.some(e => e.item.id === item(0).id), false);
  } finally { db.close(); }
});
