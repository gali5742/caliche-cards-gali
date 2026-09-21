"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiPlus,
} from "react-icons/fi";

import type { ReviewRating } from "../../domain/review/types";
import { IndexedDbDailyStudyRepository } from "../../lib/repositories/indexedDbDailyStudyRepository";
import { IndexedDbProgressRepository } from "../../lib/repositories/indexedDbProgressRepository";
import { IndexedDbReviewRepository } from "../../lib/repositories/indexedDbReviewRepository";
import { IndexedDbSettingsRepository } from "../../lib/repositories/indexedDbSettingsRepository";
import { StaticVocabularyRepository } from "../../lib/repositories/staticVocabularyRepository";
import { recordPracticeExposure } from "../../lib/review/practiceExposure";
import {
  commitStudyReviewAnswer,
  loadStudyPracticeSession,
  loadStudyReviewSession,
  type StudyReviewSession,
  type StudyReviewSessionMode,
} from "../../lib/runtime/studyReview";
import { addDailyNewVocabularyBatch } from "../../lib/study/dailyNewVocabularyPlan";
import { listRegisteredCollections } from "../../lib/textbook/registry";
import { StudyReviewQuestion } from "./StudyReviewQuestion";

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
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [addingBatch, setAddingBatch] = useState(false);
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
      setSessionGeneration((value) => value + 1);
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

  const submitRating = useCallback(
    async (rating: ReviewRating, reviewedAt: number, responseTimeMs: number) => {
      if (!current || !session || session.mode === "practice") return;
      await commitStudyReviewAnswer({
        item: current.item,
        rating,
        mode: current.item.skill === "production" ? "typing" : "recall",
        reviewedAt,
        responseTimeMs,
        fsrsConfig: session.fsrsConfig,
        reviewRepository: repositories.review,
      });
      setIndex((value) => value + 1);
    }, [current, repositories.review, session]
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

  return (
    <StudyReviewQuestion
      key={`${sessionGeneration}:${current.item.id}`}
      current={current}
      session={session}
      index={index}
      onSubmit={submitRating}
      onAdvancePractice={advancePractice}
    />
  );
}
