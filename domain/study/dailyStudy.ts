export type DailyStudyRef = {
  languageId: string;
  collectionId: string;
  book: number;
  localDate: string;
};

export type DailyStudyPlan = DailyStudyRef & {
  extraNewVocabulary: number;
};
