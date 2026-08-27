export type VocabularyGender = "masculine" | "feminine";

export type VocabularyForms = {
  feminine?: string;
  plural?: string;
  femininePlural?: string;
};

export type TextbookSourceRef = {
  book: number;
  unit: number;
  lesson: number;
  section?: string;
};

export type VocabularyEntry = {
  id: string;
  lemma: string;
  ipa: string;
  meaningsZh: string[];
  partOfSpeech: string;
  gender?: VocabularyGender;
  forms?: VocabularyForms;
  example?: string;
  exampleIpa?: string;
  exampleZh?: string;
  audioRef?: string;
  source: TextbookSourceRef;
  tags?: string[];
  notes?: string;
};
