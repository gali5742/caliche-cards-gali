import assert from "node:assert/strict";
import test from "node:test";
import { StaticVocabularyRepository } from "../lib/repositories/staticVocabularyRepository";
import { listRegisteredLessons } from "../lib/textbook/registry";

const TEXTBOOK = {
  languageId: "fr",
  collectionId: "bonjour-francais",
};

const EXPANSION = {
  languageId: "fr",
  collectionId: "bonjour-francais-theme-expansion",
};

const LESSON_9_LEMMAS = [
  "agence",
  "agence immobilière",
  "ancien",
  "annonce",
  "petite annonce",
  "appartement",
  "ascenseur",
  "avenue",
  "bout",
  "bruyant",
  "bureau",
  "calme",
  "chez",
  "clair",
  "couloir",
  "cuisine",
  "douche",
  "entrée",
  "étage",
  "face",
  "immeuble",
  "immobilier",
  "louer",
  "mètre",
  "mètre carré",
  "mois",
  "où",
  "parking",
  "placard",
  "plan",
  "premier",
  "récent",
  "responsable",
  "rez-de-chaussée",
  "salle",
  "salle de bains",
  "salutations",
  "sombre",
  "toilettes",
  "troisième",
].sort();

const EXPANSION_LEMMAS = new Map<number, string[]>([
  [
    6,
    [
      "écarlate",
      "vermeil",
      "sanglant",
      "violet",
      "clair",
      "bleu clair",
      "foncé",
      "vert foncé",
      "doré",
      "argenté",
      "marron",
      "kaki",
      "noisette",
      "rose",
      "crème",
      "aubergine",
      "brun roux",
      "vert d'émeraude",
      "bleu d'azur",
    ].sort(),
  ],
  [
    7,
    [
      "habit à la mode",
      "sous-vêtement",
      "imperméable",
      "habit de soirée",
      "robe de soirée",
      "gilet de laine",
      "chemise à manches courtes",
      "blouse de travail",
      "maillot de bain",
      "pyjama",
      "veste",
      "robe chinoise",
      "uniforme",
      "cravate",
      "gant",
      "foulard",
      "carré",
      "mouchoir",
      "ceinture",
    ].sort(),
  ],
  [
    8,
    [
      "œuvre d'art",
      "chef d'œuvre",
      "spectacle",
      "spectateur",
      "salle de spectacle",
      "applaudir",
      "applaudissements",
      "critique",
      "pièce",
      "complet",
      "sculpture",
      "dessiner",
      "papier à dessin",
      "pinceau",
      "jouer d'un instrument",
      "faire du piano",
      "pianiste",
      "faire de la guitare",
      "flûtiste",
      "concert",
      "belle voix",
      "opéra",
    ].sort(),
  ],
  [
    9,
    [
      "toit",
      "balcon",
      "cave",
      "plafond",
      "garage",
      "serrure",
      "salle de séjour",
      "salle à manger",
      "baignoire",
      "lavabo",
      "serviette de bain",
      "sonnette",
      "locataire",
      "propriétaire",
      "payer un loyer",
      "déménager",
      "louer",
    ].sort(),
  ],
]);

test("handbook audit restores repeated vocabulary rows that were previously omitted", () => {
  const lessons = listRegisteredLessons(TEXTBOOK);
  const lesson2 = lessons.find((lesson) => lesson.book === 1 && lesson.unit === 1 && lesson.lesson === 2);
  const lesson4 = lessons.find((lesson) => lesson.book === 1 && lesson.unit === 1 && lesson.lesson === 4);
  const lesson5 = lessons.find((lesson) => lesson.book === 1 && lesson.unit === 2 && lesson.lesson === 5);

  assert.ok(lesson2);
  assert.ok(lesson4);
  assert.ok(lesson5);

  assert.equal(
    lesson2.entries.find((entry) => entry.lemma === "français")?.reviewOf,
    "fr:bonjour-francais:b1-u1-l1-francais"
  );
  assert.equal(
    lesson4.entries.find((entry) => entry.lemma === "espagnol")?.reviewOf,
    "fr:bonjour-francais:b1-u1-l2-espagnol"
  );
  assert.equal(
    lesson5.entries.find((entry) => entry.lemma === "avec")?.reviewOf,
    "fr:bonjour-francais:b1-u1-l3-avec"
  );
  assert.equal(
    lesson5.entries.find((entry) => entry.lemma === "de")?.reviewOf,
    "fr:bonjour-francais:b1-u1-l4-de"
  );
});

test("restored repeated lesson rows keep one canonical FSRS vocabulary identity", async () => {
  const repository = new StaticVocabularyRepository();
  const unlocked = await repository.listUnlocked({
    ...TEXTBOOK,
    book: 1,
    unit: 2,
    lesson: 5,
  });

  for (const lemma of ["français", "espagnol", "avec", "de"]) {
    assert.equal(
      unlocked.filter((entry) => entry.lemma === lemma).length,
      1,
      `expected one canonical review identity for ${lemma}`
    );
  }
});

test("Book 1 Lesson 9 matches the 40-row textbook vocabulary table", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 3 && entry.lesson === 9
  );
  assert.ok(lesson);
  assert.equal(lesson.coverage, "complete");
  assert.deepEqual(
    lesson.entries.map((entry) => entry.lemma).sort(),
    LESSON_9_LEMMAS
  );
});

test("Lesson 9 keeps handbook morphology, gender, compounds, and louer present tense", () => {
  const lesson = listRegisteredLessons(TEXTBOOK).find(
    (entry) => entry.book === 1 && entry.unit === 3 && entry.lesson === 9
  );
  assert.ok(lesson);

  const ancien = lesson.entries.find((entry) => entry.lemma === "ancien");
  const bureau = lesson.entries.find((entry) => entry.lemma === "bureau");
  const louer = lesson.entries.find((entry) => entry.lemma === "louer");
  const piece = listRegisteredLessons(TEXTBOOK)
    .find((entry) => entry.book === 1 && entry.unit === 2 && entry.lesson === 5)
    ?.entries.find((entry) => entry.lemma === "pièce");

  assert.equal(ancien?.grammar?.forms?.feminine, "ancienne");
  assert.equal(bureau?.grammar?.forms?.plural, "bureaux");
  assert.equal(
    louer?.grammar?.verb?.conjugations?.[0]?.forms.find((form) => form.person === "1p")?.form,
    "nous louons"
  );
  assert.equal(lesson.entries.some((entry) => entry.lemma === "agence immobilière"), true);
  assert.equal(lesson.entries.some((entry) => entry.lemma === "petite annonce"), true);
  assert.equal(lesson.entries.some((entry) => entry.lemma === "mètre carré"), true);
  assert.equal(lesson.entries.some((entry) => entry.lemma === "salle de bains"), true);
  assert.equal(piece?.meaningsZh.includes("件"), true);
});

test("handbook theme expansion is registered through Lesson 9", () => {
  const lessons = listRegisteredLessons(EXPANSION);

  for (const [lessonNumber, expectedLemmas] of EXPANSION_LEMMAS) {
    const unit = lessonNumber <= 8 ? 2 : 3;
    const lesson = lessons.find(
      (entry) => entry.book === 1 && entry.unit === unit && entry.lesson === lessonNumber
    );
    assert.ok(lesson, `missing expansion Lesson ${lessonNumber}`);
    assert.equal(lesson.coverage, "complete");
    assert.deepEqual(
      lesson.entries.map((entry) => entry.lemma).sort(),
      expectedLemmas
    );
  }
});
