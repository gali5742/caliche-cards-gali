export type ReviewSkill = "recognition" | "production";

export type ReviewMode = "recall" | "multiple-choice" | "typing" | "audio";

export type ReviewRating = "again" | "hard" | "good" | "easy";

export type ReviewItem = {
  id: string;
  vocabularyId: string;
  skill: ReviewSkill;
  enabled: boolean;
};

export type ReviewEvent = {
  id: string;
  reviewItemId: string;
  reviewedAt: number;
  rating: ReviewRating;
  mode: ReviewMode;
  responseTimeMs?: number;
};
