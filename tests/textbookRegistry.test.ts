import assert from "node:assert/strict";
import test from "node:test";
import type { VocabularyEntry } from "../domain/vocabulary/types";
import { StaticVocabularyRepository } from "../lib/repositories/staticVocabularyRepository";
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

const LESSON_7_LEMMAS = [
  "bien",
  "bon",
  "boutique",
  "cher",
  "combien",
  "coûter",
  "et",
  "euro",
  "faire",
  "gris",
  "hum",
  "joli",
  "pour",
  "prix",
  "pull",
  "quantité",
  "shopping",
  "taille",
  "très",
  "trouver",
  "type",
  "vendeur",
].sort();

const LESSON_7_REVIEW_REUSE = new Map<string, string>([
  ["bien", "fr:bonjour-francais:b1-u1-l3-bien"],
  ["bon", "fr:bonjour-francais:b1-u1-l3-bon"],
  ["et", "fr:bonjour-francais:b1-u1-l1-et"],
  ["pull", "fr:bonjour-francais:b1-u2-l6-pull"],
  ["trouver", "fr:bonjour-francais:b1-u2-l5-trouver"],
]);

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

test("Book 1 Lesson 7 registers the complete 22-item textbook vocabulary table", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 7
  );

  assert.ok(lesson);
  assert.equal(lesson.coverage, "complete");
  assert.deepEqual(
    lesson.entries.map((entry) => entry.lemma).sort(),
    LESSON_7_LEMMAS
  );
});

test("Lesson 7 repeated textbook terms point to their earlier canonical review items", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 7
  );
  assert.ok(lesson);

  for (const [lemma, canonicalId] of LESSON_7_REVIEW_REUSE) {
    const repeatedEntry: VocabularyEntry | undefined = lesson.entries.find(
      (candidate) => candidate.lemma === lemma
    );
    assert.ok(repeatedEntry, `missing repeated lesson entry: ${lemma}`);
    assert.equal(repeatedEntry.reviewOf, canonicalId);
  }

  assert.equal(
    lesson.entries.filter((entry) => entry.reviewOf !== undefined).length,
    LESSON_7_REVIEW_REUSE.size
  );
});

test("repeated lesson terms stay visible but do not create duplicate FSRS vocabulary", async () => {
  const repository = new StaticVocabularyRepository();
  const lesson6Ref = { ...TEXTBOOK, book: 1, unit: 2, lesson: 6 };
  const lesson7Ref = { ...TEXTBOOK, book: 1, unit: 2, lesson: 7 };

  const [lesson7, unlockedThrough6, unlockedThrough7] = await Promise.all([
    repository.listByLesson(lesson7Ref),
    repository.listUnlocked(lesson6Ref),
    repository.listUnlocked(lesson7Ref),
  ]);

  assert.equal(lesson7.length, 22);
  assert.equal(unlockedThrough7.length, unlockedThrough6.length + 17);

  for (const lemma of LESSON_7_REVIEW_REUSE.keys()) {
    assert.equal(
      unlockedThrough7.filter((entry) => entry.lemma === lemma).length,
      1,
      `expected one canonical review item for ${lemma}`
    );
  }

  const trouverBefore = unlockedThrough6.find((entry) => entry.lemma === "trouver");
  const trouverAfter = unlockedThrough7.find((entry) => entry.lemma === "trouver");
  assert.ok(trouverBefore);
  assert.ok(trouverAfter);
  assert.equal(trouverAfter.id, "fr:bonjour-francais:b1-u2-l5-trouver");
  assert.equal(trouverBefore.meaningsZh.includes("认为"), false);
  assert.equal(trouverAfter.meaningsZh.includes("认为"), true);
});

test("Lesson 7 stores faire present tense and adjective morphology", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 7
  );
  assert.ok(lesson);

  const faire = lesson.entries.find((entry) => entry.lemma === "faire");
  const cher = lesson.entries.find((entry) => entry.lemma === "cher");
  const vendeur = lesson.entries.find((entry) => entry.lemma === "vendeur");

  assert.equal(
    faire?.grammar?.verb?.conjugations?.[0]?.forms.find(
      (form) => form.person === "1p"
    )?.form,
    "nous faisons"
  );
  assert.equal(cher?.grammar?.forms?.feminine, "chère");
  assert.equal(vendeur?.grammar?.forms?.feminine, "vendeuse");
});
