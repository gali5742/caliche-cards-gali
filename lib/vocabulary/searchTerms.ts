import type { VocabularyEntry } from "../../domain/vocabulary/types";

export function vocabularyEntrySearchTerms(entry: VocabularyEntry): string[] {
  const conjugationTerms =
    entry.grammar?.verb?.conjugations?.flatMap((conjugation) => [
      conjugation.id,
      conjugation.label,
      ...conjugation.forms.flatMap((form) => [
        form.person ?? "",
        form.form,
        form.ipa ?? "",
      ]),
    ]) ?? [];

  return [
    entry.lemma,
    entry.ipa ?? "",
    entry.partOfSpeech,
    ...entry.meaningsZh,
    ...(entry.tags ?? []),
    ...Object.values(entry.grammar?.forms ?? {}),
    entry.grammar?.verb?.conjugationClass ?? "",
    ...conjugationTerms,
  ];
}
