import type {
  VocabularyConjugationSet,
  VocabularyEntry,
  VocabularyGrammar,
} from "../../domain/vocabulary/types";
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

function uniqueStrings(...groups: Array<readonly string[] | undefined>): string[] {
  return [...new Set(groups.flatMap((group) => group ?? []))];
}

function mergeConjugations(
  canonical: readonly VocabularyConjugationSet[] | undefined,
  repeated: readonly VocabularyConjugationSet[] | undefined
): VocabularyConjugationSet[] | undefined {
  if (!canonical && !repeated) return undefined;

  const byId = new Map<string, VocabularyConjugationSet>();
  for (const conjugation of canonical ?? []) {
    byId.set(conjugation.id, {
      ...conjugation,
      forms: conjugation.forms.map((form) => ({ ...form })),
    });
  }
  for (const conjugation of repeated ?? []) {
    byId.set(conjugation.id, {
      ...conjugation,
      forms: conjugation.forms.map((form) => ({ ...form })),
    });
  }
  return [...byId.values()];
}

function mergeGrammar(
  canonical: VocabularyGrammar | undefined,
  repeated: VocabularyGrammar | undefined
): VocabularyGrammar | undefined {
  if (!canonical && !repeated) return undefined;

  const forms = {
    ...(canonical?.forms ?? {}),
    ...(repeated?.forms ?? {}),
  };
  const conjugations = mergeConjugations(
    canonical?.verb?.conjugations,
    repeated?.verb?.conjugations
  );
  const verb =
    canonical?.verb || repeated?.verb
      ? {
          ...(canonical?.verb ?? {}),
          ...(repeated?.verb ?? {}),
          ...(conjugations ? { conjugations } : {}),
        }
      : undefined;

  return {
    ...(canonical ?? {}),
    ...(repeated ?? {}),
    ...(Object.keys(forms).length > 0 ? { forms } : {}),
    ...(verb ? { verb } : {}),
  };
}

function mergeRepeatedVocabulary(
  canonical: VocabularyEntry,
  repeated: VocabularyEntry
): VocabularyEntry {
  const tags = uniqueStrings(canonical.tags, repeated.tags);

  return {
    ...canonical,
    ipa: canonical.ipa ?? repeated.ipa,
    meaningsZh: uniqueStrings(canonical.meaningsZh, repeated.meaningsZh),
    grammar: mergeGrammar(canonical.grammar, repeated.grammar),
    ...(tags.length > 0 ? { tags } : {}),
  };
}

function canonicalizeEntries(entries: readonly VocabularyEntry[]): VocabularyEntry[] {
  const canonicalById = new Map<string, VocabularyEntry>();
  const order: string[] = [];

  for (const entry of entries) {
    const canonicalId = entry.reviewOf ?? entry.id;
    if (!entry.reviewOf) {
      canonicalById.set(entry.id, {
        ...entry,
        source: { ...entry.source },
        meaningsZh: [...entry.meaningsZh],
        grammar: mergeGrammar(entry.grammar, undefined),
        ...(entry.tags ? { tags: [...entry.tags] } : {}),
      });
      order.push(entry.id);
      continue;
    }

    const canonical = canonicalById.get(canonicalId);
    if (!canonical) {
      throw new Error(`reviewOf target was not unlocked before repeated entry: ${entry.id}`);
    }
    canonicalById.set(canonicalId, mergeRepeatedVocabulary(canonical, entry));
  }

  return order.map((id) => canonicalById.get(id)!);
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
    const unlocked = this.entries.filter((entry) => {
      const entryRef = getLessonRef(entry);
      return (
        entryRef !== null &&
        sameCollection(entryRef, ref) &&
        compareLesson(entryRef, ref) <= 0
      );
    });

    return canonicalizeEntries(unlocked);
  }

  async search(query: string): Promise<VocabularyEntry[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];

    return canonicalizeEntries(this.entries).filter((entry) =>
      vocabularyEntrySearchTerms(entry)
        .join("\n")
        .toLocaleLowerCase()
        .includes(normalized)
    );
  }
}
