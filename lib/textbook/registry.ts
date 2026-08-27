import lessonB1U1L1 from "../../data/textbooks/bonjour-francais/book-01/unit-01/lesson-01.json";
import lessonB1U1L2 from "../../data/textbooks/bonjour-francais/book-01/unit-01/lesson-02.json";
import lessonB1U1L3 from "../../data/textbooks/bonjour-francais/book-01/unit-01/lesson-03.json";
import lessonB1U1L4 from "../../data/textbooks/bonjour-francais/book-01/unit-01/lesson-04.json";
import lessonB1U2L5 from "../../data/textbooks/bonjour-francais/book-01/unit-02/lesson-05.json";
import type {
  ContentCollection,
  ContentCollectionRef,
} from "../../domain/content/types";
import type { TextbookLessonData } from "../../domain/textbook/types";
import { validateLessonData } from "./validateLessonData";

const COLLECTIONS: ContentCollection[] = [
  {
    languageId: "fr",
    collectionId: "bonjour-francais",
    kind: "textbook",
    title: "你好！法语",
  },
];

const LESSONS: TextbookLessonData[] = [
  validateLessonData(lessonB1U1L1),
  validateLessonData(lessonB1U1L2),
  validateLessonData(lessonB1U1L3),
  validateLessonData(lessonB1U1L4),
  validateLessonData(lessonB1U2L5),
];

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
          }
        : undefined,
    })),
  }));
}
