"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiBookOpen,
  FiSearch,
  FiX,
} from "react-icons/fi";

import type { ContentCollection } from "../../domain/content/types";
import { IndexedDbProgressRepository } from "../../lib/repositories/indexedDbProgressRepository";
import { listRegisteredBooks } from "../../lib/runtime/studyHome";
import {
  isVocabularyLessonUnlocked,
  loadStudyVocabularySnapshot,
  vocabularyEntryMatches,
  type StudyVocabularyLesson,
  type StudyVocabularySnapshot,
} from "../../lib/runtime/studyVocabulary";
import { listRegisteredCollections } from "../../lib/textbook/registry";
import {
  vocabularyFormDetails,
  vocabularyGrammarHeadline,
} from "../../lib/vocabulary/presentation";

type VocabularyScope = "learned" | "all";

function collectionKey(collection: ContentCollection): string {
  return `${collection.languageId}:${collection.collectionId}`;
}

function lessonKey(lesson: Pick<StudyVocabularyLesson, "unit" | "lesson">): string {
  return `${lesson.unit}:${lesson.lesson}`;
}

function lessonLabel(lesson: Pick<StudyVocabularyLesson, "unit" | "lesson">): string {
  return `Unité ${lesson.unit} · Leçon ${lesson.lesson}`;
}

export function MobileStudyVocabulary() {
  const searchParams = useSearchParams();
  const collections = useMemo(() => listRegisteredCollections(), []);
  const requestedCollectionKey = `${searchParams.get("language") ?? ""}:${
    searchParams.get("collection") ?? ""
  }`;
  const initialCollection =
    collections.find(
      (collection) => collectionKey(collection) === requestedCollectionKey
    ) ?? collections[0] ?? null;

  const [selectedCollectionKey, setSelectedCollectionKey] = useState(
    initialCollection ? collectionKey(initialCollection) : ""
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
  const requestedBook = Number(searchParams.get("book"));
  const [selectedBook, setSelectedBook] = useState<number | null>(() =>
    Number.isInteger(requestedBook) && requestedBook > 0
      ? requestedBook
      : books[0] ?? null
  );
  const [snapshot, setSnapshot] = useState<StudyVocabularySnapshot | null>(null);
  const [scope, setScope] = useState<VocabularyScope>("learned");
  const [selectedLessonKey, setSelectedLessonKey] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedBook((current) =>
      current !== null && books.includes(current) ? current : books[0] ?? null
    );
  }, [books]);

  const load = useCallback(async () => {
    if (!selectedCollection || selectedBook === null) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setSnapshot(
        await loadStudyVocabularySnapshot({
          collection: selectedCollection,
          book: selectedBook,
          progressRepository: new IndexedDbProgressRepository(),
        })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取词库");
    } finally {
      setLoading(false);
    }
  }, [selectedBook, selectedCollection]);

  useEffect(() => {
    void load();
  }, [load]);

  const learnedLessons = useMemo(
    () =>
      snapshot?.lessons.filter((lesson) =>
        isVocabularyLessonUnlocked(lesson, snapshot.progress)
      ) ?? [],
    [snapshot]
  );
  const scopeLessons = scope === "learned" ? learnedLessons : snapshot?.lessons ?? [];

  useEffect(() => {
    if (selectedLessonKey === "all") return;
    if (!scopeLessons.some((lesson) => lessonKey(lesson) === selectedLessonKey)) {
      setSelectedLessonKey("all");
    }
  }, [scopeLessons, selectedLessonKey]);

  const filteredLessons = useMemo(
    () =>
      scopeLessons
        .filter(
          (lesson) =>
            selectedLessonKey === "all" || lessonKey(lesson) === selectedLessonKey
        )
        .map((lesson) => ({
          ...lesson,
          entries: lesson.entries.filter((entry) => vocabularyEntryMatches(entry, query)),
        }))
        .filter((lesson) => lesson.entries.length > 0),
    [query, scopeLessons, selectedLessonKey]
  );

  const learnedCount = learnedLessons.reduce(
    (total, lesson) => total + lesson.entries.length,
    0
  );
  const allCount =
    snapshot?.lessons.reduce((total, lesson) => total + lesson.entries.length, 0) ?? 0;
  const resultCount = filteredLessons.reduce(
    (total, lesson) => total + lesson.entries.length,
    0
  );

  return (
    <main className="min-h-[100dvh] bg-[#07111d] text-slate-100">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[430px] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.9rem)]">
        <header className="flex items-center gap-3">
          <Link
            href="/study"
            aria-label="返回今日复习"
            className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition duration-150 active:scale-90 active:bg-white/10"
          >
            <FiArrowLeft aria-hidden="true" size={19} />
          </Link>
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-sky-300/80">
              学习
            </div>
            <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-white">
              词库
            </h1>
          </div>
        </header>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-5 text-rose-200">
            {error}
          </div>
        )}

        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
          {collections.length > 1 ? (
            <label className="block">
              <span className="text-sm text-slate-500">词库</span>
              <select
                value={selectedCollectionKey}
                onChange={(event) => setSelectedCollectionKey(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-base text-white"
              >
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
              <div className="text-sm text-slate-500">当前词库</div>
              <div className="mt-1 text-xl font-medium text-white">
                {selectedCollection.title}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">尚未注册任何词库</div>
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

        {loading ? (
          <div className="flex min-h-[45dvh] items-center justify-center text-sm text-slate-500">
            正在读取词库…
          </div>
        ) : snapshot ? (
          <>
            <section className="mt-5 space-y-3">
              <div className="grid grid-cols-2 rounded-[20px] bg-white/[0.055] p-1">
                <button
                  type="button"
                  onClick={() => setScope("learned")}
                  className={`rounded-[16px] px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] ${
                    scope === "learned"
                      ? "bg-white text-slate-950"
                      : "text-slate-400"
                  }`}
                >
                  已学 · {learnedCount}
                </button>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={`rounded-[16px] px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] ${
                    scope === "all" ? "bg-white text-slate-950" : "text-slate-400"
                  }`}
                >
                  全部 · {allCount}
                </button>
              </div>

              <div className="relative">
                <FiSearch
                  aria-hidden="true"
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="搜索法语或中文"
                  className="w-full rounded-[20px] border border-white/10 bg-white/[0.055] py-3.5 pl-11 pr-11 text-base text-white outline-none placeholder:text-slate-600 focus:border-sky-400/50"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="清除搜索"
                    className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition active:scale-90 active:bg-white/10 active:text-slate-300"
                  >
                    <FiX aria-hidden="true" size={18} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={selectedLessonKey}
                  onChange={(event) => setSelectedLessonKey(event.target.value)}
                  className="min-w-0 flex-1 rounded-[18px] border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-200 outline-none focus:border-sky-400/50"
                >
                  <option value="all">全部课次</option>
                  {scopeLessons.map((lesson) => (
                    <option key={lessonKey(lesson)} value={lessonKey(lesson)}>
                      {lessonLabel(lesson)}
                      {lesson.coverage === "partial" ? " · 当前部分" : ""}
                    </option>
                  ))}
                </select>
                <div className="shrink-0 text-sm tabular-nums text-slate-500">
                  {resultCount} 词
                </div>
              </div>
            </section>

            {scope === "learned" && !snapshot.progress ? (
              <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.045] p-5 text-center">
                <div className="text-lg font-medium text-white">还没有学习进度</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  设置当前课次后，这里会形成你的学习单词表。
                </p>
                <Link
                  href="/study/progress"
                  className="mt-5 inline-flex rounded-[18px] bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition active:scale-[0.97]"
                >
                  设置学习进度
                </Link>
              </section>
            ) : filteredLessons.length > 0 ? (
              <div className="mt-6 space-y-6">
                {filteredLessons.map((lesson) => (
                  <section key={lessonKey(lesson)}>
                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                      <div className="flex items-center gap-2.5">
                        <FiBookOpen aria-hidden="true" size={16} className="text-sky-300" />
                        <h2 className="text-base font-medium text-slate-200">
                          {lessonLabel(lesson)}
                        </h2>
                      </div>
                      {lesson.coverage === "partial" && (
                        <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-xs text-amber-200">
                          当前部分
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {lesson.entries.map((entry) => {
                        const grammar = vocabularyGrammarHeadline(entry);
                        const forms = vocabularyFormDetails(entry);
                        return (
                          <article
                            key={entry.id}
                            className="rounded-[22px] border border-white/10 bg-white/[0.045] px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[21px] font-semibold leading-7 tracking-[-0.02em] text-white">
                                  {entry.lemma}
                                </div>
                                {entry.ipa && (
                                  <div className="mt-1 text-sm text-slate-400">
                                    {entry.ipa}
                                  </div>
                                )}
                              </div>
                              {grammar && (
                                <div className="max-w-[42%] shrink-0 text-right text-sm leading-5 text-slate-500">
                                  {grammar}
                                </div>
                              )}
                            </div>

                            <div className="mt-3 text-base leading-6 text-slate-200">
                              {entry.meaningsZh.join("；")}
                            </div>

                            {forms.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {forms.map((form) => (
                                  <span
                                    key={form}
                                    className="rounded-full bg-white/[0.055] px-2.5 py-1 text-xs text-slate-400"
                                  >
                                    {form}
                                  </span>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-10 text-center text-sm text-slate-500">
                没有找到符合条件的词。
              </div>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
