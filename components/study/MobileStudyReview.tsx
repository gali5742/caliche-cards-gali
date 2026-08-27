"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiCheckCircle, FiEye, FiXCircle } from "react-icons/fi";

import type { ReviewRating } from "../../domain/review/types";
import { IndexedDbProgressRepository } from "../../lib/repositories/indexedDbProgressRepository";
import { IndexedDbReviewRepository } from "../../lib/repositories/indexedDbReviewRepository";
import { IndexedDbSettingsRepository } from "../../lib/repositories/indexedDbSettingsRepository";
import { StaticVocabularyRepository } from "../../lib/repositories/staticVocabularyRepository";
import { isProductionAnswerCorrect } from "../../lib/review/productionAnswer";
import {
  commitStudyReviewAnswer,
  loadStudyReviewSession,
  type StudyReviewSession,
} from "../../lib/runtime/studyReview";
import { listRegisteredCollections } from "../../lib/textbook/registry";

const RATINGS: Array<{
  rating: ReviewRating;
  label: string;
  hint: string;
}> = [
  { rating: "again", label: "忘了", hint: "Again" },
  { rating: "hard", label: "困难", hint: "Hard" },
  { rating: "good", label: "记得", hint: "Good" },
  { rating: "easy", label: "很熟", hint: "Easy" },
];

function queueKindLabel(kind: "due" | "continuation" | "new"): string {
  if (kind === "due") return "到期复习";
  if (kind === "continuation") return "继续学习";
  return "新词";
}

export function MobileStudyReview({
  languageId,
  collectionId,
  book,
}: {
  languageId?: string;
  collectionId?: string;
  book?: number | null;
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
  const [promptStartedAt, setPromptStartedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!collection || !book || book < 1) {
      setError("复习入口缺少有效的词库或册数");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await loadStudyReviewSession({
        collection,
        book,
        now: Date.now(),
        progressRepository: repositories.progress,
        settingsRepository: repositories.settings,
        vocabularyRepository: repositories.vocabulary,
        reviewRepository: repositories.review,
      });
      setSession(next);
      setIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法建立复习队列");
    } finally {
      setLoading(false);
    }
  }, [book, collection, repositories]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = session?.queue.entries[index] ?? null;
  const total = session?.queue.entries.length ?? 0;
  const complete = Boolean(session && index >= total);

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
      if (!current || !session || submitting) return;

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

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#07111d] px-6 text-sm text-slate-500">
        正在建立今日复习…
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="min-h-[100dvh] bg-[#07111d] px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-slate-100">
        <div className="mx-auto w-full max-w-[430px]">
          <Link href="/study" className="inline-flex items-center gap-2 text-sm text-slate-400">
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
      <main className="min-h-[100dvh] bg-[#07111d] px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-slate-100">
        <div className="mx-auto w-full max-w-[430px]">
          <Link href="/study" className="inline-flex items-center gap-2 text-sm text-slate-400">
            <FiArrowLeft aria-hidden="true" /> 返回首页
          </Link>
          <div className="mt-8 rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
            <div className="text-lg font-medium text-white">还不能开始复习</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              当前词库还没有保存学习进度。请先在首页设置学习位置。
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (complete || !current) {
    return (
      <main className="min-h-[100dvh] bg-[#07111d] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.25rem)] text-slate-100">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-[430px] flex-col">
          <Link href="/study" className="inline-flex items-center gap-2 text-sm text-slate-400">
            <FiArrowLeft aria-hidden="true" /> 返回首页
          </Link>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
              <FiCheckCircle aria-hidden="true" size={28} />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
              本轮完成
            </h1>
            <p className="mt-2 max-w-[280px] text-sm leading-6 text-slate-400">
              已完成这次打开复习页时排入的 {total} 个任务。之后到期的短间隔任务会再次出现在首页。
            </p>
            <Link
              href="/study"
              className="mt-7 w-full max-w-[280px] rounded-[20px] bg-white px-5 py-3.5 text-sm font-semibold text-slate-950"
            >
              回到今日首页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const isRecognition = current.item.skill === "recognition";
  const canRate = isRecognition ? revealed : productionChecked;
  const progressPercent = total > 0 ? ((index + 1) / total) * 100 : 0;

  return (
    <main className="min-h-[100dvh] bg-[#07111d] text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+1rem)]">
        <header>
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/study"
              className="inline-flex items-center gap-2 rounded-full py-2 text-sm text-slate-400"
            >
              <FiArrowLeft aria-hidden="true" /> 结束本轮
            </Link>
            <div className="text-xs tabular-nums text-slate-500">
              {index + 1} / {total}
            </div>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-[11px]">
            <span className="rounded-full bg-white/6 px-2.5 py-1 text-slate-400">
              {queueKindLabel(current.kind)}
            </span>
            <span className="text-slate-600">
              {isRecognition ? "recognition" : "production"}
            </span>
          </div>
        </header>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="flex flex-1 flex-col justify-center py-8">
          {isRecognition ? (
            <>
              <div className="text-center">
                <div className="text-[34px] font-semibold tracking-[-0.04em] text-white">
                  {current.vocabulary.lemma}
                </div>
                {current.vocabulary.ipa && (
                  <div className="mt-2 text-base text-slate-500">
                    {current.vocabulary.ipa}
                  </div>
                )}
                <div className="mt-3 text-xs text-slate-600">回忆它的含义</div>
              </div>

              {!revealed ? (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="mt-10 w-full rounded-[22px] bg-white px-5 py-4 text-base font-semibold text-slate-950"
                >
                  <span className="inline-flex items-center gap-2">
                    <FiEye aria-hidden="true" /> 显示答案
                  </span>
                </button>
              ) : (
                <div className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.05] p-5 text-center">
                  <div className="text-xs text-slate-500">答案</div>
                  <div className="mt-2 text-xl font-medium leading-8 text-white">
                    {current.vocabulary.meaningsZh.join("；")}
                  </div>
                  <div className="mt-3 text-xs text-slate-600">
                    {current.vocabulary.partOfSpeech}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-center">
                <div className="text-xs text-slate-500">根据含义写出词条原形</div>
                <div className="mt-4 text-[28px] font-semibold leading-10 tracking-[-0.03em] text-white">
                  {current.vocabulary.meaningsZh.join("；")}
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  {current.vocabulary.partOfSpeech}
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
                  placeholder="输入外语原形"
                  className="w-full rounded-[22px] border border-white/12 bg-white/[0.055] px-4 py-4 text-center text-xl text-white outline-none placeholder:text-sm placeholder:text-slate-700 focus:border-sky-400/50 disabled:opacity-75"
                />
                <p className="mt-2 text-center text-[11px] leading-5 text-slate-600">
                  大小写与多余空格不计；重音、变音符号和拼写必须一致
                </p>
              </div>

              {!productionChecked ? (
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setProductionChecked(true)}
                    className="rounded-[20px] border border-white/10 bg-white/[0.05] px-4 py-3.5 text-sm font-medium text-slate-300"
                  >
                    不会 / 看答案
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductionChecked(true)}
                    disabled={!answer.trim()}
                    className="rounded-[20px] bg-white px-4 py-3.5 text-sm font-semibold text-slate-950 disabled:opacity-35"
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
                    className={`inline-flex items-center gap-2 text-sm font-medium ${
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
                  <div className="mt-4 text-2xl font-semibold text-white">
                    {current.vocabulary.lemma}
                  </div>
                  {current.vocabulary.ipa && (
                    <div className="mt-1 text-sm text-slate-500">
                      {current.vocabulary.ipa}
                    </div>
                  )}
                  {!productionCorrect && answer.trim() && (
                    <div className="mt-3 text-xs text-slate-500">
                      你的输入：{answer}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {canRate && (
          <section className="border-t border-white/8 pt-4">
            <div className="mb-3 text-center text-[11px] text-slate-600">
              根据实际回忆难度评分
            </div>
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map((option) => (
                <button
                  key={option.rating}
                  type="button"
                  onClick={() => void submitRating(option.rating)}
                  disabled={submitting}
                  className="rounded-[18px] border border-white/10 bg-white/[0.055] px-1 py-3 text-center transition active:scale-[0.98] disabled:opacity-40"
                >
                  <div className="text-sm font-medium text-slate-200">
                    {option.label}
                  </div>
                  <div className="mt-1 text-[9px] uppercase tracking-wide text-slate-600">
                    {option.hint}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
