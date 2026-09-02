import type { VocabularyEntry } from "../../domain/vocabulary/types";

const FRENCH_PART_OF_SPEECH: Record<string, string> = {
  nom: "名词",
  "nom propre": "专有名词",
  verbe: "动词",
  "verbe pronominal": "代词式动词",
  adjectif: "形容词",
  adverbe: "副词",
  préposition: "介词",
  pronom: "代词",
  article: "冠词",
  déterminant: "限定词",
  conjonction: "连词",
  interjection: "感叹词",
  "locution adverbiale": "副词短语",
  "locution prépositive": "介词短语",
  "locution verbale": "动词短语",
};

const FRENCH_FORM_LABELS: Record<string, string> = {
  feminine: "阴性形式",
  masculine: "阳性形式",
  plural: "复数",
  singular: "单数",
};

const FRENCH_VERB_CLASS_LABELS: Record<string, string> = {
  "regular-er": "规则 -er",
  "first-group-stem-change": "第一组 · 词干变化",
  irregular: "不规则",
};

export function vocabularyPartOfSpeechLabel(entry: VocabularyEntry): string {
  if (entry.source.languageId === "fr") {
    return FRENCH_PART_OF_SPEECH[entry.partOfSpeech] ?? entry.partOfSpeech;
  }
  return entry.partOfSpeech;
}

export function vocabularyGenderLabel(entry: VocabularyEntry): string | null {
  if (entry.source.languageId !== "fr") return entry.grammar?.gender ?? null;
  if (entry.grammar?.gender === "feminine") return "阴性";
  if (entry.grammar?.gender === "masculine") return "阳性";
  if (entry.grammar?.gender === "common") return "阳性 / 阴性（同形）";
  return entry.grammar?.gender ?? null;
}

export function vocabularyVerbClassLabel(entry: VocabularyEntry): string | null {
  const conjugationClass = entry.grammar?.verb?.conjugationClass;
  if (!conjugationClass) return null;
  if (entry.source.languageId === "fr") {
    return FRENCH_VERB_CLASS_LABELS[conjugationClass] ?? conjugationClass;
  }
  return conjugationClass;
}

export function vocabularyGrammarHeadline(entry: VocabularyEntry): string {
  return [
    vocabularyPartOfSpeechLabel(entry),
    vocabularyGenderLabel(entry),
    vocabularyVerbClassLabel(entry),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function vocabularyFormDetails(entry: VocabularyEntry): string[] {
  const forms = entry.grammar?.forms;
  if (!forms) return [];

  return Object.entries(forms).map(([key, value]) => {
    const label =
      entry.source.languageId === "fr" ? FRENCH_FORM_LABELS[key] ?? key : key;
    return `${label}：${value}`;
  });
}
