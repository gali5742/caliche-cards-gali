import type { ContentCollectionRef } from "../content/types";

export type VocabularyGrammar = {
  gender?: string;
  forms?: Record<string, string>;
};

export type VocabularySourceRef = ContentCollectionRef & {
  kind: "textbook" | "collection";
  book?: number;
  unit?: number;
  lesson?: number;
  section?: string;
};

export type VocabularyEntry = {
  id: string;
  lemma: string;
  ipa?: string;
  meaningsZh: string[];
  partOfSpeech: string;
  grammar?: VocabularyGrammar;
  example?: string;
  exampleIpa?: string;
  exampleZh?: string;
  audioRef?: string;
  source: VocabularySourceRef;
  tags?: string[];
  notes?: string;
};
