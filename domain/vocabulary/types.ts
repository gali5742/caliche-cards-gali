import type { ContentCollectionRef } from "../content/types";

export type VocabularyConjugationForm = {
  person?: string;
  form: string;
  ipa?: string;
};

export type VocabularyConjugationSet = {
  id: string;
  label: string;
  forms: VocabularyConjugationForm[];
};

export type VocabularyVerbGrammar = {
  conjugationClass?: string;
  conjugations?: VocabularyConjugationSet[];
};

export type VocabularyGrammar = {
  gender?: string;
  forms?: Record<string, string>;
  verb?: VocabularyVerbGrammar;
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
  /**
   * Points a repeated textbook-table entry at the canonical vocabulary item
   * that owns review state. The repeated entry remains visible in its lesson,
   * but must not generate a second FSRS item.
   */
  reviewOf?: string;
};
