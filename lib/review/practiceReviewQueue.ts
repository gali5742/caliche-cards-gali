import type { ReviewSkill } from "../../domain/review/types";
import type { LearningProgress } from "../../domain/textbook/types";
import type { VocabularyEntry } from "../../domain/vocabulary/types";
import type { ReviewRepository } from "../repositories/reviewRepository";
import type { VocabularyRepository } from "../repositories/vocabularyRepository";
import { isNewFsrsSchedulerState } from "../srs/fsrsState";
import type {
  TodayReviewQueue,
  TodayReviewQueueEntry,
} from "./todayReviewQueue";
import { generateReviewItems } from "./reviewItemGenerator";

function skillOrder(skill: ReviewSkill): number {
  return skill === "recognition" ? 0 : 1;
}

export async function buildPracticeReviewQueue(input: {
  progress: LearningProgress;
  vocabularyRepository: VocabularyRepository;
  reviewRepository: ReviewRepository;
  skills: readonly ReviewSkill[];
}): Promise<TodayReviewQueue> {
  const lessonRef = {
    languageId: input.progress.languageId,
    collectionId: input.progress.collectionId,
    book: input.progress.book,
    unit: input.progress.unlockedThrough.unit,
    lesson: input.progress.unlockedThrough.lesson,
  };

  const vocabulary = await input.vocabularyRepository.listUnlocked(lessonRef);
  const activeVocabularyIds = new Set(vocabulary.map((entry) => entry.id));

  const generatedItems = generateReviewItems(vocabulary, {
    skills: input.skills,
  });
  const storedItems = await input.reviewRepository.getItems(
    generatedItems.map((item) => item.id)
  );
  const storedItemById = new Map(storedItems.map((item) => [item.id, item]));

  const states = await Promise.all(
    storedItems.map(async (item) => ({
      item,
      state: await input.reviewRepository.getState(item.id),
    }))
  );
  const stateByItemId = new Map(
    states
      .filter(
        (entry): entry is {
          item: (typeof storedItems)[number];
          state: NonNullable<(typeof entry)["state"]>;
        } => entry.state !== null
      )
      .map((entry) => [entry.item.id, entry.state])
  );

  const learnedVocabularyIds = new Set(
    (await input.reviewRepository.listIntroducedVocabularyIds()).filter((id) =>
      activeVocabularyIds.has(id)
    )
  );

  for (const { item, state } of states) {
    if (!state || !activeVocabularyIds.has(item.vocabularyId)) continue;
    if (
      !isNewFsrsSchedulerState({
        due: state.due,
        raw: state.state,
      })
    ) {
      learnedVocabularyIds.add(item.vocabularyId);
    }
  }

  const learnedVocabulary = vocabulary.filter((entry) =>
    learnedVocabularyIds.has(entry.id)
  );
  const vocabularyById = new Map<string, VocabularyEntry>(
    learnedVocabulary.map((entry) => [entry.id, entry])
  );
  const vocabularyOrder = new Map(
    learnedVocabulary.map((entry, index) => [entry.id, index])
  );

  const practiceItems = generateReviewItems(learnedVocabulary, {
    skills: input.skills,
  });
  const entries: TodayReviewQueueEntry[] = [];

  for (const generatedItem of practiceItems) {
    const item = storedItemById.get(generatedItem.id);
    const entry = vocabularyById.get(generatedItem.vocabularyId);
    const state = item ? stateByItemId.get(item.id) : undefined;
    if (!item?.enabled || !entry || !state) continue;

    entries.push({
      item,
      vocabulary: entry,
      state,
      kind: "continuation",
    });
  }

  entries.sort(
    (a, b) =>
      skillOrder(a.item.skill) - skillOrder(b.item.skill) ||
      (vocabularyOrder.get(a.item.vocabularyId) ?? Number.MAX_SAFE_INTEGER) -
        (vocabularyOrder.get(b.item.vocabularyId) ?? Number.MAX_SAFE_INTEGER)
  );

  return {
    entries,
    summary: {
      dueItems: 0,
      continuationItems: entries.length,
      newItems: 0,
      newVocabulary: 0,
      introducedVocabularyToday: 0,
      remainingNewVocabularyCapacity: 0,
      availableNewVocabulary: 0,
      totalItems: entries.length,
    },
  };
}
