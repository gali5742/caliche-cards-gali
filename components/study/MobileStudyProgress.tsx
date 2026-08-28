"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiBookOpen, FiCheck } from "react-icons/fi";

import type { ContentCollection } from "../../domain/content/types";
import type { LearningProgress } from "../../domain/textbook/types";
import { IndexedDbProgressRepository } from "../../lib/repositories/indexedDbProgressRepository";
import {
  listStudyProgressLessons,
  loadStudyProgress,
  saveStudyProgressAtLesson,
  type StudyProgressLessonOption,
} from "../../lib/runtime/studyProgress";
import { listRegisteredBooks } from "../../lib/runtime/studyHome";
import { listRegisteredCollections } from "../../lib/textbook/registry";

function collectionKey(collection: ContentCollection): string {
  return `${collection.languageId}:${collection.collectionId}`;
}

function lessonKey(lesson: Pick<StudyProgressLessonOption, "unit" | "lesson">): string {
  return `${lesson.unit}:${lesson.lesson}`;
}

export function MobileStudyProgress() {
  const router = useRouter();
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
  const lessons = useMemo(
    () =>
      selectedCollection && selectedBook !== null
        ? listStudyProgressLessons(selectedCollection, selectedBook)
        : [],
    [selectedBook, selectedCollection]
  );
  const groupedLessons = useMemo(() => {
    const groups = new Map<number, StudyProgressLessonOption[]>();
    for (const lesson of lessons) {
      const current = groups.get(lesson.unit) ?? [];
      current.push(lesson);
      groups.set(lesson.unit, current);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [lessons]);

  const [savedProgress, setSavedProgress] = useState<LearningProgress | null>(null);
  const [selectedLessonKey, setSelectedLessonKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedBook((current) =>
      current !== null && books.includes(current) ? current : books[0] ?? null
    );
  }, [books]);

  const load = useCallback(async () => {
    if (!selectedCollection || selectedBook === null) {
      setSavedProgress(null);
      setSelectedLessonKey("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const progress = await loadStudyProgress({
        collection: selectedCollection,
        book: selectedBook,
        progressRepository: new IndexedDbProgressRepository(),
      });
      setSavedProgress(progress);
      setSelectedLessonKey(
        progress ? lessonKey(progress.unlockedThrough) : ""
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取学习进度");
    } finally {
      setLoading(false);
    }
  }, [selectedBook, selectedCollection]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedLesson = lessons.find(
    (lesson) => lessonKey(lesson) === selectedLessonKey
  );
  const savedKey = savedProgress ? lessonKey(savedProgress.unlockedThrough) : "";
  const dirty = Boolean(selectedLesson && selectedLessonKey !== savedKey);

  const save = useCallback(async () => {
    if (!selectedCollection || selectedBook === null || !selectedLesson) return;

    setSaving(true);
    setError(null);
    try {
      await saveStudyProgressAtLesson({
        collection: selectedCollection,
        book: selectedBook,
        unit: selectedLesson.unit,
        lesson: selectedLesson.lesson,
        progressRepository: new IndexedDbProgressRepository(),
      });
      router.push("/study");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法保存学习进度");
      setSaving(false);
    }
  }, [router, selectedBook, selectedCollection, selectedLesson]);

  return (
    <main className="min-h-[100dvh] bg-[#07111d] text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.9rem)]">
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
              学习进度
            </h1>
          </div>
        </header>

        <p className="mt-5 text-sm leading-6 text-slate-400">
          选择已经学到的课次。
        </p>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-5 text-rose-200">
            {error}
          </div>
        )}

        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
          {collections.length > 1 && (
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
          )}

          {selectedCollection && (
            <div className={collections.length > 1 ? "mt-5" : ""}>
              <div className="text-sm text-slate-500">当前词库</div>
              <div className="mt-1 text-xl font-medium text-white">
                {selectedCollection.title}
              </div>
            </div>
          )}

          {books.length > 1 && (
            <div className="mt-5 flex flex-wrap gap-2">
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
          <div className="flex flex-1 items-center justify-center py-20 text-sm text-slate-500">
            正在读取学习进度…
          </div>
        ) : groupedLessons.length > 0 ? (
          <div className="mt-5 space-y-4">
            {groupedLessons.map(([unit, unitLessons]) => (
              <section
                key={unit}
                className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
                    <FiBookOpen aria-hidden="true" size={17} />
                  </div>
                  <div className="text-lg font-medium text-white">Unité {unit}</div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {unitLessons.map((lesson) => {
                    const key = lessonKey(lesson);
                    const selected = key === selectedLessonKey;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedLessonKey(key)}
                        className={`rounded-[20px] border px-4 py-4 text-left transition duration-150 active:scale-[0.97] ${
                          selected
                            ? "border-sky-300/40 bg-sky-400/12 text-white"
                            : "border-white/10 bg-black/15 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-medium">
                            Leçon {lesson.lesson}
                          </span>
                          {selected && (
                            <FiCheck aria-hidden="true" className="text-sky-300" />
                          )}
                        </div>
                        {lesson.coverage === "partial" && (
                          <div className="mt-2 text-xs text-amber-200/80">
                            已录入当前部分
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-400">
            当前词库还没有可选择的课次。
          </div>
        )}

        <div className="mt-auto pt-8">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!selectedLesson || saving || (!dirty && Boolean(savedProgress))}
            className="w-full rounded-[22px] bg-sky-400 px-5 py-4 text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.97] active:brightness-90 disabled:bg-white/10 disabled:text-slate-600"
          >
            {saving
              ? "正在保存…"
              : savedProgress && !dirty
                ? "当前进度已保存"
                : "保存学习进度"}
          </button>
        </div>
      </div>
    </main>
  );
}
