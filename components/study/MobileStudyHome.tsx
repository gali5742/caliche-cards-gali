"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiBookOpen, FiChevronRight, FiPlus, FiSettings } from "react-icons/fi";

import type { ContentCollection } from "../../domain/content/types";
import { IndexedDbDailyStudyRepository } from "../../lib/repositories/indexedDbDailyStudyRepository";
import { IndexedDbProgressRepository } from "../../lib/repositories/indexedDbProgressRepository";
import { IndexedDbReviewRepository } from "../../lib/repositories/indexedDbReviewRepository";
import { IndexedDbSettingsRepository } from "../../lib/repositories/indexedDbSettingsRepository";
import { StaticVocabularyRepository } from "../../lib/repositories/staticVocabularyRepository";
import {
  listRegisteredBooks,
  loadStudyHomeSnapshot,
  type StudyHomeSnapshot,
} from "../../lib/runtime/studyHome";
import { addDailyNewVocabularyBatch } from "../../lib/study/dailyNewVocabularyPlan";
import { listRegisteredCollections } from "../../lib/textbook/registry";

function collectionKey(collection: ContentCollection): string {
  return `${collection.languageId}:${collection.collectionId}`;
}

function formatProgress(snapshot: StudyHomeSnapshot): string {
  const progress = snapshot.progress;
  if (!progress) return "尚未设置";
  return `第 ${progress.book} 册 · Unité ${progress.unlockedThrough.unit} · Leçon ${progress.unlockedThrough.lesson}`;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-[0_18px_50px_-32px_rgba(0,0,0,0.9)]">
      <div className="text-xs font-medium tracking-[0.08em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
      <div className="mt-1 text-xs leading-4 text-slate-500">{hint}</div>
    </div>
  );
}

export function MobileStudyHome() {
  const router = useRouter();
  const collections = useMemo(() => listRegisteredCollections(), []);
  const dailyStudyRepository = useMemo(
    () => new IndexedDbDailyStudyRepository(),
    []
  );
  const [selectedCollectionKey, setSelectedCollectionKey] = useState(() =>
    collections.length === 1 ? collectionKey(collections[0]) : ""
  );
  const selectedCollection = useMemo(
    () =>
      collections.find(
        (collection) => collectionKey(collection) === selectedCollectionKey
      ) ?? null,
    [collections, selectedCollectionKey]
  );
  const books = useMemo(
    () => (selectedCollection ? listRegisteredBooks(selectedCollection) : []),
    [selectedCollection]
  );
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<StudyHomeSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [addingBatch, setAddingBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setSelectedBook((current) =>
      current !== null && books.includes(current) ? current : books[0] ?? null
    );
  }, [books]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const reload = useCallback(async () => {
    if (!selectedCollection || selectedBook === null) {
      setSnapshot(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await loadStudyHomeSnapshot({
        collection: selectedCollection,
        book: selectedBook,
        now: Date.now(),
        progressRepository: new IndexedDbProgressRepository(),
        settingsRepository: new IndexedDbSettingsRepository(),
        vocabularyRepository: new StaticVocabularyRepository(),
        reviewRepository: new IndexedDbReviewRepository(),
        dailyStudyRepository,
      });
      setSnapshot(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取学习数据");
    } finally {
      setLoading(false);
    }
  }, [dailyStudyRepository, selectedBook, selectedCollection]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const queue = snapshot?.queue;
  const total = queue?.totalItems ?? 0;
  const reviewHref =
    selectedCollection && selectedBook !== null
      ? `/study/review?language=${encodeURIComponent(
          selectedCollection.languageId
        )}&collection=${encodeURIComponent(
          selectedCollection.collectionId
        )}&book=${selectedBook}`
      : null;
  const practiceHref = reviewHref ? `${reviewHref}&mode=practice` : null;
  const progressHref =
    selectedCollection && selectedBook !== null
      ? `/study/progress?language=${encodeURIComponent(
          selectedCollection.languageId
        )}&collection=${encodeURIComponent(
          selectedCollection.collectionId
        )}&book=${selectedBook}`
      : "/study/progress";
  const batchSize = snapshot?.settings.dailyNewVocabularyLimit ?? 0;
  const remainingNewVocabulary = queue?.availableNewVocabulary ?? 0;
  const canAddBatch =
    total === 0 &&
    Boolean(reviewHref) &&
    batchSize > 0 &&
    remainingNewVocabulary > 0;
  const nextBatchCount = Math.min(batchSize, remainingNewVocabulary);

  const addAnotherBatch = useCallback(async () => {
    if (
      !selectedCollection ||
      selectedBook === null ||
      !snapshot ||
      !reviewHref ||
      snapshot.settings.dailyNewVocabularyLimit <= 0
    ) {
      return;
    }

    setAddingBatch(true);
    setError(null);
    try {
      await addDailyNewVocabularyBatch({
        collection: selectedCollection,
        book: selectedBook,
        now: Date.now(),
        amount: snapshot.settings.dailyNewVocabularyLimit,
        repository: dailyStudyRepository,
      });
      router.push(reviewHref);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法追加新词");
      setAddingBatch(false);
    }
  }, [dailyStudyRepository, reviewHref, router, selectedBook, selectedCollection, snapshot]);

  return (
    <main className="min-h-[100dvh] bg-[#07111d] text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.9rem)]">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-sky-300/80">
              词汇复习
            </div>
            <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.04em] text-white">
              今日复习
            </h1>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                online
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                  : "border-amber-300/20 bg-amber-300/10 text-amber-200"
              }`}
            >
              {online ? "在线" : "离线"}
            </div>
            <Link
              href="/study/settings"
              aria-label="打开设置"
              className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition duration-150 active:scale-90 active:bg-white/10"
            >
              <FiSettings aria-hidden="true" size={17} />
            </Link>
          </div>
        </header>

        <section className="mt-7 rounded-[28px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-900/80 p-5 shadow-[0_24px_70px_-42px_rgba(56,189,248,0.55)]">
          {collections.length > 1 ? (
            <label className="block">
              <span className="text-sm text-slate-400">当前词库</span>
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-base text-white"
                value={selectedCollectionKey}
                onChange={(event) => setSelectedCollectionKey(event.target.value)}
              >
                <option value="">选择词库</option>
                {collections.map((collection) => (
                  <option
                    key={collectionKey(collection)}
                    value={collectionKey(collection)}
                  >
                    {collection.title}
                  </option>
                ))}
              </select>
            </label>
          ) : selectedCollection ? (
            <div>
              <div className="text-sm text-slate-400">当前词库</div>
              <div className="mt-1 text-xl font-medium text-white">
                {selectedCollection.title}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">尚未注册任何词库</div>
          )}

          {books.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {books.map((book) => (
                <button
                  key={book}
                  type="button"
                  onClick={() => setSelectedBook(book)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition duration-150 active:scale-95 ${
                    selectedBook === book
                      ? "bg-white text-slate-950"
                      : "bg-white/8 text-slate-300"
                  }`}
                >
                  第 {book} 册
                </button>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-5 text-rose-200">
            {error}
          </div>
        )}

        {loading && !snapshot ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-500">
            正在读取学习数据…
          </div>
        ) : snapshot?.progress ? (
          <>
            <section className="mt-5 grid grid-cols-3 gap-2.5">
              <MetricCard
                label="到期"
                value={queue?.dueItems ?? 0}
                hint="到期任务"
              />
              <MetricCard
                label="继续"
                value={queue?.continuationItems ?? 0}
                hint="继续巩固"
              />
              <MetricCard
                label="新词"
                value={queue?.newVocabulary ?? 0}
                hint={
                  snapshot.dailyExtraNewVocabulary > 0
                    ? `今日已扩至 ${snapshot.effectiveDailyNewVocabularyLimit}`
                    : `默认 ${snapshot.settings.dailyNewVocabularyLimit}`
                }
              />
            </section>

            <Link
              href={progressHref}
              className="mt-5 block rounded-[28px] border border-white/10 bg-white/[0.045] p-5 transition duration-150 active:scale-[0.985] active:bg-white/[0.075]"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
                  <FiBookOpen aria-hidden="true" size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-500">学习进度</div>
                  <div className="mt-1 truncate text-base font-medium text-slate-100">
                    {formatProgress(snapshot)}
                  </div>
                </div>
                <FiChevronRight aria-hidden="true" className="text-slate-600" size={20} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-4 text-sm">
                <div>
                  <div className="text-slate-500">看义写词</div>
                  <div className="mt-1 text-slate-300">
                    {snapshot.settings.productionEnabled ? "已启用" : "已关闭"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">目标记忆率</div>
                  <div className="mt-1 text-slate-300">
                    {Math.round(snapshot.settings.fsrsRequestRetention * 100)}%
                  </div>
                </div>
              </div>
            </Link>

            <div className="mt-auto space-y-3 pt-8">
              {total > 0 && reviewHref ? (
                <Link
                  href={reviewHref}
                  className="block w-full rounded-[22px] bg-sky-400 px-5 py-4 text-center text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.97] active:brightness-90"
                >
                  开始复习 · {total}
                </Link>
              ) : (
                <div className="w-full rounded-[22px] border border-emerald-400/15 bg-emerald-400/8 px-5 py-4 text-center text-base font-semibold text-emerald-200">
                  今日已完成
                </div>
              )}

              {canAddBatch && (
                <button
                  type="button"
                  onClick={() => void addAnotherBatch()}
                  disabled={addingBatch}
                  className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-sky-400 px-5 py-4 text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.97] active:brightness-90 disabled:opacity-50"
                >
                  <FiPlus aria-hidden="true" size={18} />
                  {addingBatch
                    ? "正在加入…"
                    : `再学一组 · ${nextBatchCount} 个新词`}
                </button>
              )}

              {practiceHref && (
                <Link
                  href={practiceHref}
                  className="block w-full rounded-[22px] border border-white/12 bg-white/[0.055] px-5 py-3.5 text-center text-base font-semibold text-slate-200 transition duration-150 active:scale-[0.97] active:bg-white/[0.1]"
                >
                  自由复习
                </Link>
              )}
            </div>
          </>
        ) : snapshot ? (
          <section className="mt-5 rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
            <div className="text-lg font-medium text-white">设置学习进度</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              选择已经学到的课次后即可开始复习。
            </p>
            {snapshot.latestRegisteredLesson ? (
              <Link
                href={progressHref}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-[20px] bg-white px-4 py-3.5 text-sm font-semibold text-slate-950 transition duration-150 active:scale-[0.97]"
              >
                选择学习进度
                <FiChevronRight aria-hidden="true" size={16} />
              </Link>
            ) : (
              <div className="mt-4 text-sm text-slate-500">
                当前词库还没有可学习的内容。
              </div>
            )}
          </section>
        ) : null}

        <footer className="mt-8 text-center text-xs tracking-[0.12em] text-slate-700">
          本地优先 · 间隔复习
        </footer>
      </div>
    </main>
  );
}
