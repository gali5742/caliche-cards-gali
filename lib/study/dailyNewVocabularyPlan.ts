import type { ContentCollectionRef } from "../../domain/content/types";
import type { DailyStudyRepository } from "../repositories/dailyStudyRepository";

export function getLocalDateKey(timestamp: number): string {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    throw new Error("Cannot build a daily study plan for an invalid timestamp");
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeRef(input: {
  collection: ContentCollectionRef;
  book: number;
  now: number;
}) {
  return {
    languageId: input.collection.languageId,
    collectionId: input.collection.collectionId,
    book: input.book,
    localDate: getLocalDateKey(input.now),
  };
}

export async function getDailyExtraNewVocabulary(input: {
  collection: ContentCollectionRef;
  book: number;
  now: number;
  repository: DailyStudyRepository;
}): Promise<number> {
  const plan = await input.repository.get(makeRef(input));
  return plan?.extraNewVocabulary ?? 0;
}

export async function addDailyNewVocabularyBatch(input: {
  collection: ContentCollectionRef;
  book: number;
  now: number;
  amount: number;
  repository: DailyStudyRepository;
}): Promise<number> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("New vocabulary batch size must be a positive integer");
  }

  const ref = makeRef(input);
  const current = await input.repository.get(ref);
  const extraNewVocabulary = (current?.extraNewVocabulary ?? 0) + input.amount;

  await input.repository.save({
    ...ref,
    extraNewVocabulary,
  });

  return extraNewVocabulary;
}
