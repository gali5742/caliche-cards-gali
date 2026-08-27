import type { VocabularyEntry } from "../../domain/vocabulary/types";
import { listRegisteredLessons } from "../textbook/registry";
import type { VocabularyLessonRef, VocabularyRepository } from "./vocabularyRepository";

function compareLesson(a: VocabularyLessonRef, b: VocabularyLessonRef): number {
  if (a.book !== b.book) return a.book - b.book;
  if (a.unit !== b.unit) return a.unit - b.unit;
  return a.lesson - b.lesson;
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
    return this.entries.filter(
      (entry) =>
        entry.source.book === ref.book &&
        entry.source.unit === ref.unit &&
        entry.source.lesson === ref.lesson
    );
  }

  async listUnlocked(ref: VocabularyLessonRef): Promise<VocabularyEntry[]> {
    return this.entries.filter((entry) => compareLesson(entry.source, ref) <= 0);
  }

  async search(query: string): Promise<VocabularyEntry[]> {
    const normalized = query.trim().toLocaleLowerCase("fr");
    if (!normalized) return [];

    return this.entries.filter((entry) => {
      const haystack = [
        entry.lemma,
        entry.ipa,
        entry.partOfSpeech,
        ...entry.meaningsZh,
        ...(entry.tags ?? []),
      ]
        .join("\n")
        .toLocaleLowerCase("fr");

      return haystack.includes(normalized);
    });
  }
}
