export type LessonPosition = {
  unit: number;
  lesson: number;
};

export type LearningProgress = {
  book: number;
  unlockedThrough: LessonPosition;
};
