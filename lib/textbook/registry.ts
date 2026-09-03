import lessonB1U1L1 from "../../data/textbooks/bonjour-francais/book-01/unit-01/lesson-01.json";
import lessonB1U1L2 from "../../data/textbooks/bonjour-francais/book-01/unit-01/lesson-02.json";
import lessonB1U1L3 from "../../data/textbooks/bonjour-francais/book-01/unit-01/lesson-03.json";
import lessonB1U1L4 from "../../data/textbooks/bonjour-francais/book-01/unit-01/lesson-04.json";
import lessonB1U2L5 from "../../data/textbooks/bonjour-francais/book-01/unit-02/lesson-05.json";
import lessonB1U2L6 from "../../data/textbooks/bonjour-francais/book-01/unit-02/lesson-06.json";
import expansionB1U1L1 from "../../data/textbooks/bonjour-francais-theme-expansion/book-01/unit-01/lesson-01.json";
import expansionB1U1L2 from "../../data/textbooks/bonjour-francais-theme-expansion/book-01/unit-01/lesson-02.json";
import expansionB1U1L3 from "../../data/textbooks/bonjour-francais-theme-expansion/book-01/unit-01/lesson-03.json";
import expansionB1U1L4 from "../../data/textbooks/bonjour-francais-theme-expansion/book-01/unit-01/lesson-04.json";
import expansionB1U2L5 from "../../data/textbooks/bonjour-francais-theme-expansion/book-01/unit-02/lesson-05.json";
import type {
  ContentCollection,
  ContentCollectionRef,
} from "../../domain/content/types";
import type { TextbookLessonData } from "../../domain/textbook/types";
import type { VocabularyEntry } from "../../domain/vocabulary/types";
import { validateLessonData } from "./validateLessonData";

const COLLECTIONS: ContentCollection[] = [
  {
    languageId: "fr",
    collectionId: "bonjour-francais",
    kind: "textbook",
    title: "你好！法语",
  },
  {
    languageId: "fr",
    collectionId: "bonjour-francais-theme-expansion",
    kind: "textbook",
    title: "你好！法语 · 主题拓展",
  },
];

function normalizeLemma(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function validateRegistry(lessons: TextbookLessonData[]): TextbookLessonData[] {
  const lessonKeys = new Set<string>();
  const vocabularyById = new Map<string, VocabularyEntry>();
  const vocabularyOrder = new Map<string, number>();
  let order = 0;

  for (const lesson of lessons) {
    const lessonKey = `${lesson.languageId}:${lesson.collectionId}:b${lesson.book}:u${lesson.unit}:l${lesson.lesson}`;
    if (lessonKeys.has(lessonKey)) {
      throw new Error(`duplicate registered lesson: ${lessonKey}`);
    }
    lessonKeys.add(lessonKey);

    for (const entry of lesson.entries) {
      if (vocabularyById.has(entry.id)) {
        throw new Error(`duplicate registered vocabulary id: ${entry.id}`);
      }
      vocabularyById.set(entry.id, entry);
      vocabularyOrder.set(entry.id, order++);
    }
  }

  for (const entry of vocabularyById.values()) {
    if (!entry.reviewOf) continue;

    const canonical = vocabularyById.get(entry.reviewOf);
    if (!canonical) {
      throw new Error(
        `reviewOf target does not exist: ${entry.id} -> ${entry.reviewOf}`
      );
    }
    if (canonical.reviewOf) {
      throw new Error(
        `reviewOf must point directly to a canonical vocabulary item: ${entry.id}`
      );
    }
    if ((vocabularyOrder.get(canonical.id) ?? Infinity) >= (vocabularyOrder.get(entry.id) ?? -1)) {
      throw new Error(`reviewOf must reference an earlier registered vocabulary item: ${entry.id}`);
    }
    if (normalizeLemma(canonical.lemma) !== normalizeLemma(entry.lemma)) {
      throw new Error(
        `reviewOf must reference the same lemma: ${entry.id} -> ${entry.reviewOf}`
      );
    }
    if (canonical.partOfSpeech !== entry.partOfSpeech) {
      throw new Error(
        `reviewOf must reference the same part of speech: ${entry.id} -> ${entry.reviewOf}`
      );
    }
  }

  return lessons;
}

const LESSONS: TextbookLessonData[] = validateRegistry([
  validateLessonData(lessonB1U1L1),
  validateLessonData(lessonB1U1L2),
  validateLessonData(lessonB1U1L3),
  validateLessonData(lessonB1U1L4),
  validateLessonData(lessonB1U2L5),
  validateLessonData(lessonB1U2L6),
  validateLessonData(expansionB1U1L1),
  validateLessonData(expansionB1U1L2),
  validateLessonData(expansionB1U1L3),
  validateLessonData(expansionB1U1L4),
  validateLessonData(expansionB1U2L5),
]);

function matchesCollection(
  lesson: TextbookLessonData,
  ref: ContentCollectionRef
): boolean {
  return (
    lesson.languageId === ref.languageId &&
    lesson.collectionId === ref.collectionId
  );
}

export function listRegisteredCollections(): ContentCollection[] {
  return COLLECTIONS.map((collection) => ({ ...collection }));
}

export function listRegisteredLessons(
  ref?: ContentCollectionRef
): TextbookLessonData[] {
  const lessons = ref
    ? LESSONS.filter((lesson) => matchesCollection(lesson, ref))
    : LESSONS;

  return lessons.map((lesson) => ({
    ...lesson,
    entries: lesson.entries.map((entry) => ({
      ...entry,
      source: { ...entry.source },
      grammar: entry.grammar
        ? {
            ...entry.grammar,
            forms: entry.grammar.forms
              ? { ...entry.grammar.forms }
              : undefined,
            verb: entry.grammar.verb
              ? {
                  ...entry.grammar.verb,
                  conjugations: entry.grammar.verb.conjugations?.map(
                    (conjugation) => ({
                      ...conjugation,
                      forms: conjugation.forms.map((form) => ({ ...form })),
                    })
                  ),
                }
              : undefined,
          }
        : undefined,
    })),
  }));
}
