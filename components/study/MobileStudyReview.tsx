"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiEye,
  FiPlus,
  FiXCircle,
} from "react-icons/fi";

import type { ReviewRating } from "../../domain/review/types";
import { IndexedDbDailyStudyRepository } from "../../lib/repositories/indexedDbDailyStudyRepository";
import { IndexedDbProgressRepository } from "../../lib/repositories/indexedDbProgressRepository";
import { IndexedDbReviewRepository } from "../../lib/repositories/indexedDbReviewRepository";
import { IndexedDbSettingsRepository } from "../../lib/repositories/indexedDbSettingsRepository";
import { StaticVocabularyRepository } from "../../lib/repositories/staticVocabularyRepository";
import { recordPracticeExposure } from "../../lib/review/practiceExposure";
import { isProductionAnswerCorrect } from "../../lib/review/productionAnswer";
import {
  commitStudyReviewAnswer,
  loadStudyPracticeSession,
  loadStudyReviewSession,
  type StudyReviewSession,
  type StudyReviewSessionMode,
} from "../../lib/runtime/studyReview";
import { addDailyNewVocabularyBatch } from "../../lib/study/dailyNewVocabularyPlan";
import { listRegisteredCollections } from "../../lib/textbook/registry";
import {
  vocabularyFormDetails,
  vocabularyGrammarHeadline,
} from "../../lib/vocabulary/presentation";
import { VocabularyConjugationTable } from "./VocabularyConjugationTable";

const RATINGS: Array<{
  rating: ReviewRating;
  label: string;
}> = [
  { rating: "again", label: "忘了" },
  { rating: "hard", label: "困难" },
  { rating: "good", label: "记得" },
  { rating: "easy", label: "很熟" },
];

function queueKindLabel(
  kind: "due" | "continuation" | "new",
  sameDayReinforcement: boolean
): string {
  if (sameDayReinforcement) return "同日巩固";
  if (kind === "due") return "到期复习";
  if (kind === "continuation") return "继续巩固";
  return "新词";
}

export function MobileStudyReview({
  languageId,
  collectionId,
  book,
  mode = "scheduled",
}: {
  languageId?: string;
  collectionId?: string;
  book?: number | null;
  mode?: StudyReviewSessionMode;
}) {
  const collection = useMemo(
    () =>
      listRegisteredCollections().find(
        (item) =>
          item.languageId === languageId && item.collectionId === collectionId
      ) ?? null,
    [collectionId, languageId]
  );
  const repositories = useMemo(
    () => ({
      progress: new IndexedDbProgressRepository(),
      settings: new IndexedDbSettingsRepository(),
      vocabulary: new StaticVocabularyRepository(),
      review: new IndexedDbReviewRepository(),
      dailyStudy: new IndexedDbDailyStudyRepository(),
    }),
    []
  );

  const [session, setSession] = useState<StudyReviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [productionChecked, setProductionChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addingBatch, setAddingBatch] = useState(false);
  const [promptStartedAt, setPromptStartedAt] = useState(() => Date.now());
  const practiceExposureRecorded = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!collection || !book || book < 1) {
      setError("复习入口缺少有效的词库或册数");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loadSession =
        mode === "practice" ? loadStudyPracticeSession : loadStudyReviewSession;
      const next = await loadSession({
        collection,
        book,
        now: Date.now(),
        progressRepository: repositories.progress,
        settingsRepository: repositories.settings,
        vocabularyRepository: repositories.vocabulary,
        reviewRepository: repositories.review,
        dailyStudyRepository: repositories.dailyStudy,
      });
      setSession(next);
      setIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法建立复习队列");
    } finally {
      setLoading(false);
    }
  }, [book, collection, mode, repositories]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = session?.queue.entries[index] ?? null;
  const total = session?.queue.entries.length ?? 0;
  const complete = Boolean(session && index >= total);
  const isPractice = session?.mode === "practice";
  const remainingFreshAfterSession = session
    ? Math.max(
        0,
        session.queue.summary.availableNewVocabulary -
          session.queue.summary.newVocabulary
      )
    : 0;
  const canAddBatch =
    Boolean(session) &&
    !isPractice &&
    (session?.newVocabularyBatchSize ?? 0) > 0 &&
    remainingFreshAfterSession > 0;
  const nextBatchCount = session
    ? Math.min(session.newVocabularyBatchSize, remainingFreshAfterSession)
    : 0;

  useEffect(() => {
    const itemId = current?.item.id;
    if (!isPractice || !itemId || practiceExposureRecorded.current.has(itemId)) {
      return;
    }
    practiceExposureRecorded.current.add(itemId);
    recordPracticeExposure(itemId, Date.now());
  }, [current?.item.id, isPractice]);

  useEffect(() => {
    setRevealed(false);
    setAnswer("");
    setProductionChecked(false);
    setPromptStartedAt(Date.now());
  }, [current?.item.id]);

  const productionCorrect =
    current?.item.skill === "production" && productionChecked
      ? isProductionAnswerCorrect({
          answer,
          expected: current.vocabulary.lemma,
          languageId: current.vocabulary.source.languageId,
        })
      : null;

  const submitRating = useCallback(
    async (rating: ReviewRating) => {
      if (!current || !session || submitting || session.mode === "practice") return;

      setSubmitting(true);
      setError(null);
      const reviewedAt = Date.now();
      try {
        await commitStudyReviewAnswer({
          item: current.item,
          rating,
          mode: current.item.skill === "production" ? "typing" : "recall",
          reviewedAt,
          responseTimeMs: Math.max(0, reviewedAt - promptStartedAt),
          fsrsConfig: session.fsrsConfig,
          reviewRepository: repositories.review,
        });
        setIndex((value) => value + 1);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "无法保存本次复习");
      } finally {
        setSubmitting(false);
      }
    }, [current, promptStartedAt, repositories.review, session, submitting]
  );

  const advancePractice = useCallback(() => {
    if (!current || session?.mode !== "practice") return;
    setIndex((value) => value + 1);
  }, [current, session]);

  const addAnotherBatch = useCallback(async () => {
    if (
      !session ||
      session.mode !== "scheduled" ||
      session.newVocabularyBatchSize <= 0 ||
      addingBatch
    ) {
      return;
    }

    setAddingBatch(true);
    setError(null);
    try {
      await addDailyNewVocabularyBatch({
        collection: session.collection,
        book: session.book,
        now: Date.now(),
        amount: session.newVocabularyBatchSize,
        repository: repositories.dailyStudy,
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法追加新词");
    } finally {
      setAddingBatch(false);
    }
  }, [addingBatch, load, repositories.dailyStudy, session]);

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#07111d] px-6 text-sm text-slate-500">
        {mode === "practice" ? "正在建立自由复习…" : "正在建立今日复习…"}
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="min-h-[100dvh] bg-[#07111d] px-5 pt-[calc(env(safe-area-inset-top)+0.9rem)] text-slate-100">
        <div className="mx-auto w-full max-w-[430px]">
          <Link
            href="/study"
            className="inline-flex items-center gap-2 rounded-full py-2 text-base text-slate-400 transition active:scale-95 active:text-slate-200"
          >
            <FiArrowLeft aria-hidden="true" /> 返回首页
          </Link>
          <div className="mt-8 rounded-[26px] border border-rose-400/20 bg-rose-400/10 p-5 text-sm leading-6 text-rose-200">
            {error}
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-[100dvh] bg-[#07111d] px-5 pt-[calc(env(safe-area-inset-top)+0.9rem)] text-slate-100">
        <div className="mx-auto w-full max-w-[430px]">
          <Link
            href="/study"
            className="inline-flex items-center gap-2 rounded-full py-2 text-base text-slate-400 transition active:scale-95 active:text-slate-200"
          >
            <FiArrowLeft aria-hidden="true" /> 返回首页
          </Link>
          <div className="mt-8 rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
            <div className="text-lg font-medium text-white">还不能开始复习</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              请先在首页设置学习进度。
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (complete || !current) {
    const emptyPractice = isPractice && total === 0;
    return (
      <main className="min-h-[100dvh] bg-[#07111d] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.9rem)] text-slate-100">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-[430px] flex-col">
          <Link
            href="/study"
            className="inline-flex items-center gap-2 rounded-full py-2 text-base text-slate-400 transition active:scale-95 active:text-slate-200"
          >
            <FiArrowLeft aria-hidden="true" /> 返回首页
          </Link>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
              <FiCheckCircle aria-hidden="true" size={28} />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
              {emptyPractice
                ? "暂无已学词"
                : isPractice
                  ? "自由复习完成"
                  : "本轮完成"}
            </h1>
            <p className="mt-2 max-w-[300px] text-sm leading-6 text-slate-400">
              {emptyPractice
                ? "完成一些计划复习后，这里会出现已学词。"
                : isPractice
                  ? `本轮浏览了 ${total} 个已学项目。`
                  : `已完成本轮 ${total} 个任务。可以结束今天，也可以继续加入下一组新词。`}
            </p>

            {canAddBatch && (
              <button
                type="button"
                onClick={() => void addAnotherBatch()}
                disabled={addingBatch}
                className="mt-7 flex w-full max-w-[300px] items-center justify-center gap-2 rounded-[20px] bg-sky-400 px-5 py-3.5 text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.97] active:brightness-90 disabled:opacity-50"
              >
                <FiPlus aria-hidden="true" size={18} />
                {addingBatch
                  ? "正在加入…"
                  : `再学一组 · ${nextBatchCount} 个新词`}
              </button>
            )}

            <Link
              href="/study"
              className={`${canAddBatch ? "mt-3" : "mt-7"} w-full max-w-[300px] rounded-[20px] border border-white/12 bg-white/[0.055] px-5 py-3.5 text-base font-semibold text-slate-200 transition duration-150 active:scale-[0.97] active:bg-white/[0.1]`}
            >
              回到今日首页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const isRecognition = current.item.skill === "recognition";
  const canContinue = isRecognition ? revealed : productionChecked;
  const progressPercent = total > 0 ? ((index + 1) / total) * 100 : 0;
  const grammar = vocabularyGrammarHeadline(current.vocabulary);
  const forms = vocabularyFormDetails(current.vocabulary);

  return (
    <main className="min-h-[100dvh] bg-[#07111d] text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <header>
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/study"
              className="inline-flex items-center gap-2 rounded-full py-2 text-base text-slate-400 transition duration-150 active:scale-95 active:text-slate-200"
            >
              <FiArrowLeft aria-hidden="true" /> 结束本轮
            </Link>
            <div className="text-sm tabular-nums text-slate-500">
              {index + 1} / {total}
            </div>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span className="rounded-full bg-white/6 px-3 py-1.5 text-slate-300">
              {isPractice
                ? "自由复习"
                : queueKindLabel(
                    current.kind,
                    current.sameDayReinforcement
                  )}
            </span>
            <span className="text-slate-500">
              {isRecognition ? "看词想义" : "看义写词"}
            </span>
          </div>
        </header>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="flex flex-1 flex-col justify-center py-7">
          {isRecognition ? (
            <>
              <div className="text-center">
                <div className="text-[36px] font-semibold tracking-[-0.04em] text-white">
                  {current.vocabulary.lemma}
                </div>
                {current.vocabulary.ipa && (
                  <div className="mt-2 text-lg text-slate-400">
                    {current.vocabulary.ipa}
                  </div>
                )}
                <div className="mt-4 text-base font-medium text-slate-300">
                  回忆这个词的含义
                </div>
              </div>

              {!revealed ? (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="mt-10 w-full rounded-[22px] bg-white px-5 py-4 text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.97] active:brightness-90"
                >
                  <span className="inline-flex items-center gap-2">
                    <FiEye aria-hidden="true" /> 显示答案
                  </span>
                </button>
              ) : (
                <div className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.05] p-5 text-center">
                  <div className="text-sm font-medium text-slate-400">答案</div>
                  <div className="mt-2 text-2xl font-medium leading-9 text-white">
                    {current.vocabulary.meaningsZh.join("；")}
                  </div>
                  <div className="mt-4 text-base font-medium text-slate-300">
                    {grammar}
                  </div>
                  {forms.length > 0 && (
                    <div className="mt-4 border-t border-white/8 pt-4 text-sm leading-6 text-slate-400">
                      {forms.map((form) => (
                        <div key={form}>{form}</div>
                      ))}
                    </div>
                  )}
                  <VocabularyConjugationTable entry={current.vocabulary} />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-center">
                <div className="text-lg font-medium text-slate-200">
                  根据含义写出词条原形
                </div>
                <div className="mt-4 text-[30px] font-semibold leading-10 tracking-[-0.03em] text-white">
                  {current.vocabulary.meaningsZh.join("；")}
                </div>
                <div className="mt-3 text-base font-medium text-slate-300">
                  {grammar}
                </div>
              </div>

              <div className="mt-8">
                <input
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !productionChecked) {
                      event.preventDefault();
                      setProductionChecked(true);
                    }
                  }}
                  disabled={productionChecked}
                  lang={current.vocabulary.source.languageId}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="done"
                  placeholder="输入词条原形"
                  className="w-full rounded-[22px] border border-white/12 bg-white/[0.055] px-4 py-4 text-center text-2xl text-white outline-none placeholder:text-base placeholder:text-slate-600 focus:border-sky-400/50 disabled:opacity-75"
                />
                <p className="mt-3 text-center text-sm leading-6 text-slate-500">
                  大小写与多余空格不计；重音、变音符号和拼写必须一致
                </p>
              </div>

              {!productionChecked ? (
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setProductionChecked(true)}
                    className="rounded-[20px] border border-white/10 bg-white/[0.05] px-4 py-3.5 text-base font-medium text-slate-300 transition duration-150 active:scale-[0.96] active:bg-white/[0.1]"
                  >
                    不会 / 看答案
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductionChecked(true)}
                    disabled={!answer.trim()}
                    className="rounded-[20px] bg-white px-4 py-3.5 text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.96] active:brightness-90 disabled:opacity-35"
                  >
                    检查答案
                  </button>
                </div>
              ) : (
                <div
                  className={`mt-6 rounded-[26px] border p-5 text-center ${
                    productionCorrect
                      ? "border-emerald-400/20 bg-emerald-400/10"
                      : "border-amber-300/20 bg-amber-300/10"
                  }`}
                >
                  <div
                    className={`inline-flex items-center gap-2 text-base font-medium ${
                      productionCorrect ? "text-emerald-300" : "text-amber-200"
                    }`}
                  >
                    {productionCorrect ? (
                      <FiCheckCircle aria-hidden="true" />
                    ) : (
                      <FiXCircle aria-hidden="true" />
                    )}
                    {productionCorrect ? "输入正确" : "与词条原形不同"}
                  </div>
                  <div className="mt-4 text-3xl font-semibold text-white">
                    {current.vocabulary.lemma}
                  </div>
                  {current.vocabulary.ipa && (
                    <div className="mt-1 text-base text-slate-400">
                      {current.vocabulary.ipa}
                    </div>
                  )}
                  {forms.length > 0 && (
                    <div className="mt-4 border-t border-white/8 pt-4 text-sm leading-6 text-slate-400">
                      {forms.map((form) => (
                        <div key={form}>{form}</div>
                      ))}
                    </div>
                  )}
                  <VocabularyConjugationTable entry={current.vocabulary} />
                  {!productionCorrect && answer.trim() && (
                    <div className="mt-3 text-sm text-slate-500">
                      你的输入：{answer}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {canContinue && (
          <section className="border-t border-white/8 pt-4">
            {isPractice ? (
              <button
                type="button"
                onClick={advancePractice}
                className="w-full rounded-[20px] bg-white px-5 py-4 text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.97] active:brightness-90"
              >
                下一个
              </button>
            ) : (
              <>
                <div className="mb-3 text-center text-sm text-slate-500">
                  根据实际回忆难度评分
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {RATINGS.map((option) => (
                    <button
                      key={option.rating}
                      type="button"
                      onClick={() => void submitRating(option.rating)}
                      disabled={submitting}
                      className="min-h-16 rounded-[18px] border border-white/10 bg-white/[0.055] px-1 py-3 text-center transition duration-150 active:scale-[0.94] active:bg-white/[0.12] disabled:opacity-40"
                    >
                      <div className="text-base font-medium text-slate-200">
                        {option.label}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
