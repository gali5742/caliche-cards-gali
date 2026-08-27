import type { TextbookLessonData } from "../../domain/textbook/types";
import type { VocabularyEntry } from "../../domain/vocabulary/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function validateEntry(
  value: unknown,
  lesson: {
    languageId: string;
    collectionId: string;
    book: number;
    unit: number;
    lesson: number;
  },
  index: number
): VocabularyEntry {
  if (!isRecord(value)) throw new Error(`entries[${index}] must be an object`);

  assertNonEmptyString(value.id, `entries[${index}].id`);
  assertNonEmptyString(value.lemma, `entries[${index}].lemma`);
  if (value.ipa !== undefined) {
    assertNonEmptyString(value.ipa, `entries[${index}].ipa`);
  }
  assertNonEmptyString(value.partOfSpeech, `entries[${index}].partOfSpeech`);

  if (
    !Array.isArray(value.meaningsZh) ||
    value.meaningsZh.length === 0 ||
    value.meaningsZh.some(
      (item) => typeof item !== "string" || item.trim().length === 0
    )
  ) {
    throw new Error(
      `entries[${index}].meaningsZh must contain at least one non-empty string`
    );
  }

  if (!isRecord(value.source)) {
    throw new Error(`entries[${index}].source must be an object`);
  }

  if (
    value.source.kind !== "textbook" ||
    value.source.languageId !== lesson.languageId ||
    value.source.collectionId !== lesson.collectionId ||
    value.source.book !== lesson.book ||
    value.source.unit !== lesson.unit ||
    value.source.lesson !== lesson.lesson
  ) {
    throw new Error(`entries[${index}].source must match its lesson file`);
  }

  if (value.grammar !== undefined && !isRecord(value.grammar)) {
    throw new Error(`entries[${index}].grammar must be an object`);
  }

  if (isRecord(value.grammar)) {
    if (value.grammar.gender !== undefined) {
      assertNonEmptyString(value.grammar.gender, `entries[${index}].grammar.gender`);
    }

    if (value.grammar.forms !== undefined) {
      if (!isRecord(value.grammar.forms)) {
        throw new Error(`entries[${index}].grammar.forms must be an object`);
      }
      for (const [key, form] of Object.entries(value.grammar.forms)) {
        assertNonEmptyString(key, `entries[${index}].grammar.forms key`);
        assertNonEmptyString(form, `entries[${index}].grammar.forms.${key}`);
      }
    }
  }

  const expectedPrefix = `${lesson.languageId}:${lesson.collectionId}:`;
  if (!value.id.startsWith(expectedPrefix)) {
    throw new Error(
      `entries[${index}].id must be namespaced by languageId and collectionId`
    );
  }

  return value as VocabularyEntry;
}

export function validateLessonData(value: unknown): TextbookLessonData {
  if (!isRecord(value)) throw new Error("lesson data must be an object");
  if (value.schemaVersion !== 2) {
    throw new Error("unsupported textbook schemaVersion");
  }
  assertNonEmptyString(value.languageId, "languageId");
  assertNonEmptyString(value.collectionId, "collectionId");
  assertPositiveInteger(value.book, "book");
  assertPositiveInteger(value.unit, "unit");
  assertPositiveInteger(value.lesson, "lesson");
  if (!Array.isArray(value.entries)) throw new Error("entries must be an array");

  const lesson = {
    languageId: value.languageId,
    collectionId: value.collectionId,
    book: value.book,
    unit: value.unit,
    lesson: value.lesson,
  };
  const entries = value.entries.map((entry, index) =>
    validateEntry(entry, lesson, index)
  );
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`duplicate vocabulary id: ${entry.id}`);
    ids.add(entry.id);
  }

  return {
    schemaVersion: 2,
    ...lesson,
    entries,
  };
}
