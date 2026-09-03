import assert from "node:assert/strict";
import test from "node:test";

import {
  isProductionAnswerCorrect,
  normalizeProductionAnswer,
} from "../lib/review/productionAnswer";

test("normalizes case, surrounding whitespace, repeated spaces and apostrophe variants", () => {
  assert.equal(
    normalizeProductionAnswer("  L’  AMI  ", "fr"),
    "l' ami"
  );
});

test("keeps French accents significant", () => {
  assert.equal(
    isProductionAnswerCorrect({
      answer: "etudiant",
      expected: "étudiant",
      languageId: "fr",
    }),
    false
  );
});

test("accepts canonically equivalent Unicode input", () => {
  assert.equal(
    isProductionAnswerCorrect({
      answer: "e\u0301tudiant",
      expected: "étudiant",
      languageId: "fr",
    }),
    true
  );
});
