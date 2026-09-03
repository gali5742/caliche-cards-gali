import assert from "node:assert/strict";
import test from "node:test";
import { StaticVocabularyRepository } from "../lib/repositories/staticVocabularyRepository";
import { listRegisteredLessons } from "../lib/textbook/registry";

const TEXTBOOK = {
  languageId: "fr",
  collectionId: "bonjour-francais",
};

const LESSON_8_LEMMAS = [
  "artiste",
  "coin",
  "écrivain",
  "entre",
  "film",
  "môme",
  "musicien",
  "orange",
  "peintre",
  "poème",
  "poète",
  "sculpteur",
  "tableau",
  "tableau",
].sort();

test("Book 1 Lesson 8 registers the complete 14-row vocabulary table", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 8
  );

  assert.ok(lesson);
  assert.equal(lesson.coverage, "complete");
  assert.deepEqual(
    lesson.entries.map((entry) => entry.lemma).sort(),
    LESSON_8_LEMMAS
  );
});

test("Lesson 8 reuses earlier entre and merges its two tableau senses", async () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 8
  );
  assert.ok(lesson);

  const entre = lesson.entries.find((entry) => entry.id.endsWith("-entre"));
  const tableauTable = lesson.entries.find((entry) => entry.id.endsWith("-tableau-table"));
  assert.equal(entre?.reviewOf, "fr:bonjour-francais:b1-u2-l5-entre");
  assert.equal(
    tableauTable?.reviewOf,
    "fr:bonjour-francais:b1-u2-l8-tableau-peinture"
  );

  const repository = new StaticVocabularyRepository();
  const lesson7Ref = { ...TEXTBOOK, book: 1, unit: 2, lesson: 7 };
  const lesson8Ref = { ...TEXTBOOK, book: 1, unit: 2, lesson: 8 };
  const [through7, through8] = await Promise.all([
    repository.listUnlocked(lesson7Ref),
    repository.listUnlocked(lesson8Ref),
  ]);

  assert.equal(through8.length, through7.length + 12);
  assert.equal(through8.filter((entry) => entry.lemma === "entre").length, 1);
  assert.equal(through8.filter((entry) => entry.lemma === "tableau").length, 1);

  const canonicalEntre = through8.find((entry) => entry.lemma === "entre");
  const canonicalTableau = through8.find((entry) => entry.lemma === "tableau");
  assert.equal(canonicalEntre?.id, "fr:bonjour-francais:b1-u2-l5-entre");
  assert.ok(canonicalEntre?.meaningsZh.some((meaning) => meaning.includes("时间或空间")));
  assert.equal(
    canonicalTableau?.id,
    "fr:bonjour-francais:b1-u2-l8-tableau-peinture"
  );
  assert.ok(canonicalTableau?.meaningsZh.includes("画"));
  assert.ok(canonicalTableau?.meaningsZh.includes("表格"));
});

test("Lesson 8 keeps profession gender morphology", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 8
  );
  assert.ok(lesson);

  const musicien = lesson.entries.find((entry) => entry.lemma === "musicien");
  const sculpteur = lesson.entries.find((entry) => entry.lemma === "sculpteur");
  const peintre = lesson.entries.find((entry) => entry.lemma === "peintre");

  assert.equal(musicien?.grammar?.forms?.feminine, "musicienne");
  assert.equal(sculpteur?.grammar?.forms?.feminine, "sculptrice");
  assert.equal(peintre?.grammar?.gender, "common");
});
