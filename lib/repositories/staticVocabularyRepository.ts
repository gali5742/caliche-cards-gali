import type { VocabularyEntry } from "../../domain/vocabulary/types";
import { listRegisteredLessons } from "../textbook/registry";
import { vocabularyEntrySearchTerms } from "../vocabulary/searchTerms";
import type {
  VocabularyLessonRef,
  VocabularyRepository,
} from "./vocabularyRepository";

function compareLesson(a: VocabularyLessonRef, b: VocabularyLessonRef): number {
  if (a.book !== b.book) return a.book - b.book;
  if (a.unit !== b.unit) return a.unit - b.unit;
  return a.lesson - b.lesson;
}

function getLessonRef(entry: VocabularyEntry): VocabularyLessonRef | null {
  const { source } = entry;
  if (
    source.kind !== "textbook" ||
    source.book === undefined ||
    source.unit === undefined ||
    source.lesson === undefined
  ) {
    return null;
  }

  return {
    languageId: source.languageId,
    collectionId: source.collectionId,
    book: source.book,
    unit: source.unit,
    lesson: source.lesson,
  };
}

function sameCollection(a: VocabularyLessonRef, b: VocabularyLessonRef): boolean {
  return (
    a.languageId === b.languageId && a.collectionId === b.collectionId
  );
}

function ownsReviewState(entry: VocabularyEntry): boolean {
  return entry.reviewOf === undefined;
}

export class StaticVocabularyRepository implements VocabularyRepository {
  private readonly entries: VocabularyEntry[];

  constructor() {
    this.entries = listRegisteredLessons().flatMap((lesson) => lesson.entries);
  }

  async getById(id: string): Promise<VocabularyEntry | null> {
    return this.entries.find((entry) => entry.id === id) ?? null;
  }

  async listByLesson(ref: VocabularyLessonRef): Promise<VocabularyEntry[]> {
    return this.entries.filter((entry) => {
      const entryRef = getLessonRef(entry);
      return entryRef !== null && sameCollection(entryRef, ref) && compareLesson(entryRef, ref) === 0;
    });
  }

  async listUnlocked(ref: VocabularyLessonRef): Promise<VocabularyEntry[]> {
    return this.entries.filter((entry) => {
      const entryRef = getLessonRef(entry);
      return (
        ownsReviewState(entry) &&
        entryRef !== null &&
        sameCollection(entryRef, ref) &&
        compareLesson(entryRef, ref) <= 0
      );
    });
  }

  async search(query: string): Promise<VocabularyEntry[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];

    return this.entries.filter(
      (entry) =>
        ownsReviewState(entry) &&
        vocabularyEntrySearchTerms(entry)
          .join("\n")
          .toLocaleLowerCase()
          .includes(normalized)
    );
  }
}
