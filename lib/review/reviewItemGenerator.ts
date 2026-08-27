import type { ReviewItem, ReviewSkill } from "../../domain/review/types";
import type { LearningProgress } from "../../domain/textbook/types";
import type { VocabularyEntry } from "../../domain/vocabulary/types";
import type { VocabularyRepository } from "../repositories/vocabularyRepository";

export const DEFAULT_REVIEW_SKILLS: readonly ReviewSkill[] = [
  "recognition",
  "production",
];

export type ReviewItemGenerationOptions = {
  skills?: readonly ReviewSkill[];
};

export function buildReviewItemId(vocabularyId: string, skill: ReviewSkill): string {
  return `${vocabularyId}:${skill}`;
}

export function generateReviewItems(
  entries: readonly VocabularyEntry[],
  options: ReviewItemGenerationOptions = {}
): ReviewItem[] {
  const skills = options.skills ?? DEFAULT_REVIEW_SKILLS;

  return entries.flatMap((entry) =>
    skills.map((skill) => ({
      id: buildReviewItemId(entry.id, skill),
      vocabularyId: entry.id,
      skill,
      enabled: true,
    }))
  );
}

export async function generateUnlockedReviewItems(
  repository: VocabularyRepository,
  progress: LearningProgress,
  options: ReviewItemGenerationOptions = {}
): Promise<ReviewItem[]> {
  const entries = await repository.listUnlocked({
    book: progress.book,
    unit: progress.unlockedThrough.unit,
    lesson: progress.unlockedThrough.lesson,
  });

  return generateReviewItems(entries, options);
}
