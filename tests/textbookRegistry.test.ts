import assert from "node:assert/strict";
import test from "node:test";
import { listRegisteredLessons } from "../lib/textbook/registry";
import { vocabularyPartOfSpeechLabel } from "../lib/vocabulary/presentation";

const TEXTBOOK = {
  languageId: "fr",
  collectionId: "bonjour-francais",
};

const LESSON_6_CORE_LEMMAS = [
  "autre",
  "basket",
  "blanc",
  "bleu",
  "blond",
  "brun",
  "chaussure",
  "chemise",
  "chose",
  "couleur",
  "d'accord",
  "grand",
  "jaune",
  "jean",
  "lunettes",
  "manteau",
  "ne... pas",
  "noir",
  "pantalon",
  "personne",
  "petit",
  "porter",
  "portrait-robot",
  "robe",
  "rouge",
  "tee-shirt",
  "vert",
  "vêtement",
].sort();

test("Book 1 Lesson 6 registers the complete textbook vocabulary table", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 6
  );

  assert.ok(lesson);
  assert.equal(lesson.coverage, "complete");

  const coreLemmas = lesson.entries
    .filter((entry) => !entry.tags?.includes("supplemental"))
    .map((entry) => entry.lemma)
    .sort();

  assert.deepEqual(coreLemmas, LESSON_6_CORE_LEMMAS);
});

test("Book 1 Lesson 6 keeps exercise-only pull explicitly supplemental", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 6
  );
  assert.ok(lesson);

  const pull = lesson.entries.find((entry) => entry.lemma === "pull");
  assert.ok(pull);
  assert.deepEqual(pull.tags, ["supplemental", "lesson-exercise"]);
});

test("Lesson 6 stores morphology and present-tense data used by the review UI", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 6
  );
  assert.ok(lesson);

  const blanc = lesson.entries.find((entry) => entry.lemma === "blanc");
  const manteau = lesson.entries.find((entry) => entry.lemma === "manteau");
  const porter = lesson.entries.find((entry) => entry.lemma === "porter");
  const negation = lesson.entries.find((entry) => entry.lemma === "ne... pas");

  assert.equal(blanc?.grammar?.forms?.feminine, "blanche");
  assert.equal(manteau?.grammar?.forms?.plural, "manteaux");
  assert.equal(
    porter?.grammar?.verb?.conjugations?.[0]?.forms.find(
      (form) => form.person === "1p"
    )?.form,
    "nous portons"
  );
  assert.ok(negation);
  assert.equal(vocabularyPartOfSpeechLabel(negation), "语法结构");
});
