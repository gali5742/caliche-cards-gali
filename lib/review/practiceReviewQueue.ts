import type { ReviewSkill } from "../../domain/review/types";
import type { LearningProgress } from "../../domain/textbook/types";
import type { VocabularyEntry } from "../../domain/vocabulary/types";
import type { ReviewRepository } from "../repositories/reviewRepository";
import type { VocabularyRepository } from "../repositories/vocabularyRepository";
import type {
  TodayReviewQueue,
  TodayReviewQueueEntry,
} from "./todayReviewQueue";
import { generateReviewItems } from "./reviewItemGenerator";

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
  const introducedVocabularyIds = new Set(
    (await input.reviewRepository.listIntroducedVocabularyIds()).filter((id) =>
      activeVocabularyIds.has(id)
    )
  );
  const learnedVocabulary = vocabulary.filter((entry) =>
    introducedVocabularyIds.has(entry.id)
  );

  const generatedItems = generateReviewItems(learnedVocabulary, {
    skills: input.skills,
  });
  const storedItems = await input.reviewRepository.getItems(
    generatedItems.map((item) => item.id)
  );
  const storedItemById = new Map(storedItems.map((item) => [item.id, item]));
  const vocabularyById = new Map<string, VocabularyEntry>(
    learnedVocabulary.map((entry) => [entry.id, entry])
  );

  const entries: TodayReviewQueueEntry[] = [];
  for (const generatedItem of generatedItems) {
    const item = storedItemById.get(generatedItem.id);
    const entry = vocabularyById.get(generatedItem.vocabularyId);
    if (!item?.enabled || !entry) continue;

    const state = await input.reviewRepository.getState(item.id);
    if (!state) continue;

    entries.push({
      item,
      vocabulary: entry,
      state,
      kind: "continuation",
    });
  }

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
