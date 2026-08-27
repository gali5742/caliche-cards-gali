import lessonB1U1L4 from "../../data/textbooks/bonjour-francais/book-01/unit-01/lesson-04.json";
import type { TextbookLessonData } from "../../domain/textbook/types";
import { validateLessonData } from "./validateLessonData";

const LESSONS: TextbookLessonData[] = [validateLessonData(lessonB1U1L4)];

export function listRegisteredLessons(): TextbookLessonData[] {
  return LESSONS.map((lesson) => ({ ...lesson, entries: lesson.entries.map((entry) => ({ ...entry })) }));
}
