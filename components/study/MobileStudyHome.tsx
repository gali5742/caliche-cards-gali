"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiBookOpen, FiRefreshCw, FiSettings } from "react-icons/fi";

import type { ContentCollection } from "../../domain/content/types";
import { IndexedDbProgressRepository } from "../../lib/repositories/indexedDbProgressRepository";
import { IndexedDbReviewRepository } from "../../lib/repositories/indexedDbReviewRepository";
import { IndexedDbSettingsRepository } from "../../lib/repositories/indexedDbSettingsRepository";
import { StaticVocabularyRepository } from "../../lib/repositories/staticVocabularyRepository";
import {
  initializeProgressToLatestRegisteredLesson,
  listRegisteredBooks,
  loadStudyHomeSnapshot,
  type StudyHomeSnapshot,
} from "../../lib/runtime/studyHome";
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
      <div className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</div>
    </div>
  );
}

export function MobileStudyHome() {
  const collections = useMemo(() => listRegisteredCollections(), []);
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
  const [initializing, setInitializing] = useState(false);
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
      });
      setSnapshot(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取学习数据");
    } finally {
      setLoading(false);
    }
  }, [selectedBook, selectedCollection]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const initializeProgress = useCallback(async () => {
    if (!selectedCollection || selectedBook === null) return;

    setInitializing(true);
    setError(null);
    try {
      await initializeProgressToLatestRegisteredLesson({
        collection: selectedCollection,
        book: selectedBook,
        progressRepository: new IndexedDbProgressRepository(),
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法初始化学习进度");
    } finally {
      setInitializing(false);
    }
  }, [reload, selectedBook, selectedCollection]);

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

  return (
    <main className="min-h-[100dvh] bg-[#07111d] text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">
              {selectedCollection
                ? `${selectedCollection.languageId} · ${selectedCollection.kind}`
                : "study"}
            </div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-white">
              今日复习
            </h1>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                online
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                  : "border-amber-300/20 bg-amber-300/10 text-amber-200"
              }`}
            >
              {online ? "在线" : "离线"}
            </div>
            <a
              href="/study/settings"
              aria-label="打开设置"
              className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition active:scale-95"
            >
              <FiSettings aria-hidden="true" size={15} />
            </a>
          </div>
        </header>

        <section className="mt-7 rounded-[28px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-900/80 p-5 shadow-[0_24px_70px_-42px_rgba(56,189,248,0.55)]">
          {collections.length > 1 ? (
            <label className="block">
              <span className="text-xs text-slate-400">当前词库</span>
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-white"
                value={selectedCollectionKey}
                onChange={(event) => setSelectedCollectionKey(event.target.value)}
              >
                <option value="">选择词库</option>
                {collections.map((collection) => (
                  <option
                    key={collectionKey(collection)}
                    value={collectionKey(collection)}
                  >
                    {collection.languageId.toUpperCase()} · {collection.title}
                  </option>
                ))}
              </select>
            </label>
          ) : selectedCollection ? (
            <div>
              <div className="text-xs text-slate-400">当前词库</div>
              <div className="mt-1 text-lg font-medium text-white">
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
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
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
            正在读取本地学习数据…
          </div>
        ) : snapshot?.progress ? (
          <>
            <section className="mt-5 grid grid-cols-3 gap-2.5">
              <MetricCard
                label="到期"
                value={queue?.dueItems ?? 0}
                hint="FSRS 到期"
              />
              <MetricCard
                label="继续"
                value={queue?.continuationItems ?? 0}
                hint="已学词技能"
              />
              <MetricCard
                label="新词"
                value={queue?.newVocabulary ?? 0}
                hint={`上限 ${snapshot.settings.dailyNewVocabularyLimit}`}
              />
            </section>

            <section className="mt-5 rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
                  <FiBookOpen aria-hidden="true" size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500">学习进度</div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-100">
                    {formatProgress(snapshot)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void reload()}
                  className="rounded-full p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
                  aria-label="刷新今日复习"
                >
                  <FiRefreshCw aria-hidden="true" size={16} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-4 text-xs">
                <div>
                  <div className="text-slate-500">主动回忆</div>
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
            </section>

            <div className="mt-auto pt-8">
              {total > 0 && reviewHref ? (
                <a
                  href={reviewHref}
                  className="block w-full rounded-[22px] bg-sky-400 px-5 py-4 text-center text-base font-semibold text-slate-950 transition active:scale-[0.99]"
                >
                  开始复习 · {total}
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full rounded-[22px] bg-white/10 px-5 py-4 text-base font-semibold text-slate-500"
                >
                  今日已完成
                </button>
              )}
            </div>
          </>
        ) : snapshot ? (
          <section className="mt-5 rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
            <div className="text-lg font-medium text-white">设置学习进度</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              这个词库还没有本地学习位置。首页不会猜测你的课次，也不会把个人进度写死在代码里。
            </p>
            {snapshot.latestRegisteredLesson ? (
              <>
                <div className="mt-5 rounded-2xl bg-black/20 px-4 py-3 text-sm text-slate-300">
                  当前已录入到：第 {snapshot.book} 册 · Unité {snapshot.latestRegisteredLesson.unit} · Leçon {snapshot.latestRegisteredLesson.lesson}
                </div>
                <button
                  type="button"
                  onClick={() => void initializeProgress()}
                  disabled={initializing}
                  className="mt-4 w-full rounded-[20px] bg-white px-4 py-3.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
                >
                  {initializing ? "正在保存…" : "以当前已录入内容初始化"}
                </button>
              </>
            ) : (
              <div className="mt-4 text-sm text-slate-500">
                当前词库还没有可初始化的课次数据。
              </div>
            )}
          </section>
        ) : null}

        <footer className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-slate-700">
          local-first · fsrs
        </footer>
      </div>
    </main>
  );
}
