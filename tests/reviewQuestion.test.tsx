import "./reviewDomEnvironment";
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { MobileStudyReview } from "../components/study/MobileStudyReview";
import * as runtime from "../lib/runtime/studyReview";
import * as dailyPlan from "../lib/study/dailyNewVocabularyPlan";
import { listRegisteredCollections } from "../lib/textbook/registry";
import type { TodayReviewQueueEntry } from "../lib/review/todayReviewQueue";

const collection = listRegisteredCollections()[0];
function entry(word: string, skill: "recognition" | "production"): TodayReviewQueueEntry {
  return {
    item: { id: `${word}:${skill}`, vocabularyId: word, skill, enabled: true },
    vocabulary: { id: word, lemma: word, meaningsZh: [word === "tapis" ? "地毯" : "桌子"], partOfSpeech: "nom",
      source: { kind: "textbook", languageId: collection.languageId, collectionId: collection.collectionId, book: 1, unit: 1, lesson: 1 } },
    state: { reviewItemId: `${word}:${skill}`, due: 0, state: null },
    kind: "new", sameDayReinforcement: false,
  };
}
function session(entries: TodayReviewQueueEntry[], mode: "scheduled" | "practice" = "scheduled"): runtime.StudyReviewSession {
  return { collection, book: 1, mode, fsrsConfig: {}, newVocabularyBatchSize: 1,
    progress: { languageId: collection.languageId, collectionId: collection.collectionId, book: 1, unlockedThrough: { unit: 1, lesson: 1 } },
    queue: { entries, summary: { dueItems: 0, continuationItems: 0, scheduledReviewItems: 0,
      sameDayReinforcementItems: 0, pendingReinforcementVocabulary: 0, newItems: entries.length,
      newVocabulary: 1, introducedVocabularyToday: 0, dailyNewVocabularyTarget: 1,
      remainingNewVocabularyCapacity: 1, availableNewVocabulary: 2, totalItems: entries.length } },
  };
}
function button(container: HTMLElement, label: string) {
  const found = [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label));
  assert.ok(found, `Missing button: ${label}`);
  return found;
}
async function click(container: HTMLElement, label: string) {
  await act(async () => { button(container, label).click(); });
}
async function type(container: HTMLElement, value: string) {
  await act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount(mode: "scheduled" | "practice" = "scheduled") {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  // Profiler records every DOM commit, before passive effects could hide a flash.
  const frames: string[] = [];
  await act(async () => { root.render(<Profiler id="review" onRender={() => frames.push(container.innerHTML)}>
    <MobileStudyReview languageId={collection.languageId} collectionId={collection.collectionId} book={1} mode={mode} />
  </Profiler>); });
  return { container, frames, close: async () => { await act(async () => root.unmount()); container.remove(); } };
}

test("every first commit of a new question has no old answer, result or revealed meaning", async t => {
  const entries = [entry("tapis", "recognition"), entry("table", "recognition"), entry("table", "production"), entry("tapis", "production")];
  t.mock.method(runtime, "loadStudyReviewSession", async () => session(entries));
  const commit = t.mock.method(runtime, "commitStudyReviewAnswer", async () => {});
  const ui = await mount();
  try {
    await click(ui.container, "显示答案");
    ui.frames.length = 0;
    await click(ui.container, "记得");
    const tableFrames = ui.frames.filter(f => f.includes("2 / 4"));
    assert.ok(tableFrames.length);
    for (const f of tableFrames) { assert.ok(!f.includes("桌子")); assert.ok(f.includes("显示答案")); }
    await click(ui.container, "显示答案"); await click(ui.container, "记得");
    await type(ui.container, "table"); await click(ui.container, "检查答案");
    assert.match(ui.container.textContent!, /输入正确/);
    ui.frames.length = 0;
    await click(ui.container, "记得");
    const tapisFrames = ui.frames.filter(f => f.includes("4 / 4"));
    assert.ok(tapisFrames.length);
    for (const f of tapisFrames) {
      assert.ok(f.includes("地毯"));
      assert.ok(!f.includes("tapis")); assert.ok(!f.includes("table"));
      assert.ok(!f.includes("输入正确")); assert.ok(!f.includes("与词条原形不同"));
      assert.ok(!f.includes("根据实际回忆难度评分"));
    }
    assert.equal(ui.container.querySelector("input")!.value, "");
    assert.equal(ui.container.querySelector("input")!.disabled, false);
    await click(ui.container, "不会 / 看答案"); await click(ui.container, "忘了");
    assert.match(ui.container.textContent!, /本轮完成/);
    assert.equal(commit.mock.callCount(), 4);
  } finally { await ui.close(); }
});

test("failed save retains input and result; synchronous double click commits once and allows retry", async t => {
  t.mock.method(runtime, "loadStudyReviewSession", async () => session([entry("tapis", "production"), entry("table", "recognition")]));
  let rejectSave!: (cause: Error) => void;
  let resolveSave!: () => void;
  let attempts = 0;
  t.mock.method(runtime, "commitStudyReviewAnswer", () => {
    attempts++;
    return new Promise<void>((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
  });
  const ui = await mount();
  try {
    await type(ui.container, "tapis"); await click(ui.container, "检查答案");
    await act(async () => { const b = button(ui.container, "记得"); b.click(); b.click(); });
    assert.equal(attempts, 1);
    await act(async () => rejectSave(new Error("保存失败")));
    assert.equal(ui.container.querySelector("input")!.value, "tapis");
    assert.match(ui.container.textContent!, /输入正确/); assert.match(ui.container.textContent!, /保存失败/);
    await click(ui.container, "记得"); assert.equal(attempts, 2);
    await act(async () => resolveSave());
    assert.match(ui.container.textContent!, /2 \/ 2/);
    assert.doesNotMatch(ui.container.textContent!, /保存失败|tapis|输入正确/);
    assert.ok(button(ui.container, "显示答案"));
  } finally { await ui.close(); }
});

test("free practice advances once per double click and resets the next question", async t => {
  t.mock.method(runtime, "loadStudyPracticeSession", async () => session([entry("tapis", "recognition"), entry("tapis", "production")], "practice"));
  const commit = t.mock.method(runtime, "commitStudyReviewAnswer", async () => {});
  const ui = await mount("practice");
  try {
    await click(ui.container, "显示答案");
    await act(async () => { const b = button(ui.container, "下一个"); b.click(); b.click(); });
    assert.match(ui.container.textContent!, /2 \/ 2/);
    assert.doesNotMatch(ui.container.textContent!, /tapis/);
    assert.equal(ui.container.querySelector("input")!.value, "");
    await click(ui.container, "不会 / 看答案"); await click(ui.container, "下一个");
    assert.match(ui.container.textContent!, /自由复习完成/);
    assert.equal(commit.mock.callCount(), 0);
  } finally { await ui.close(); }
});

test("reloading a new batch with the same item starts unanswered and resets response timing", async t => {
  t.mock.method(runtime, "loadStudyReviewSession", async () => session([entry("tapis", "production")]));
  t.mock.method(dailyPlan, "addDailyNewVocabularyBatch", async () => 1);
  const commit = t.mock.method(runtime, "commitStudyReviewAnswer", async () => {});
  let now = 1000; t.mock.method(Date, "now", () => now);
  const ui = await mount();
  try {
    now = 1500; await type(ui.container, "tapis"); await click(ui.container, "检查答案"); await click(ui.container, "记得");
    assert.equal(commit.mock.calls[0].arguments[0]!.responseTimeMs, 500);
    now = 10000; await click(ui.container, "再学一组");
    assert.equal(ui.container.querySelector("input")!.value, "");
    assert.doesNotMatch(ui.container.textContent!, /输入正确|tapis/);
    now = 10200; await click(ui.container, "不会 / 看答案"); await click(ui.container, "忘了");
    assert.equal(commit.mock.calls[1].arguments[0]!.responseTimeMs, 200);
  } finally { await ui.close(); }
});

