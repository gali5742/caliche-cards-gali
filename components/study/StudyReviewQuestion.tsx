"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { FiArrowLeft, FiCheckCircle, FiEye, FiXCircle } from "react-icons/fi";
import type { ReviewRating } from "../../domain/review/types";
import type { TodayReviewQueueEntry } from "../../lib/review/todayReviewQueue";
import type { StudyReviewSession } from "../../lib/runtime/studyReview";
import { isProductionAnswerCorrect } from "../../lib/review/productionAnswer";
import { vocabularyFormDetails, vocabularyGrammarHeadline } from "../../lib/vocabulary/presentation";
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
  reinforcement: boolean
): string {
  if (reinforcement) return "巩固";
  if (kind === "new") return "新词";
  return "复习";
}

export function StudyReviewQuestion({ current, session, index, onSubmit, onAdvancePractice }: {
  current: TodayReviewQueueEntry;
  session: StudyReviewSession;
  index: number;
  onSubmit: (rating: ReviewRating, reviewedAt: number, responseTimeMs: number) => Promise<void>;
  onAdvancePractice: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [productionChecked, setProductionChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptStartedAt] = useState(() => Date.now());
  // A ref closes the interval before React renders the disabled buttons.
  const advancing = useRef(false);
  const isPractice = session.mode === "practice";
  const total = session.queue.entries.length;
  const productionCorrect = current.item.skill === "production" && productionChecked
    ? isProductionAnswerCorrect({ answer, expected: current.vocabulary.lemma,
        languageId: current.vocabulary.source.languageId })
    : null;

  const submitRating = useCallback(async (rating: ReviewRating) => {
    if (isPractice || advancing.current) return;
    advancing.current = true;
    setSubmitting(true);
    setError(null);
    const reviewedAt = Date.now();
    try {
      await onSubmit(rating, reviewedAt, Math.max(0, reviewedAt - promptStartedAt));
      // Stay locked until this question unmounts, including the successful-commit gap.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法保存本次复习");
      advancing.current = false;
      setSubmitting(false);
    }
  }, [isPractice, onSubmit, promptStartedAt]);

  function advancePractice() {
    if (!isPractice || advancing.current) return;
    advancing.current = true;
    onAdvancePractice();
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
