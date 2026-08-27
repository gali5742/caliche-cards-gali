export function normalizeProductionAnswer(
  value: string,
  languageId?: string
): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[’‘‛ʼ]/g, "'")
    .trim()
    .replace(/\s+/g, " ");

  if (!languageId) return normalized.toLocaleLowerCase();

  try {
    return normalized.toLocaleLowerCase(languageId);
  } catch {
    return normalized.toLocaleLowerCase();
  }
}

export function isProductionAnswerCorrect(input: {
  answer: string;
  expected: string;
  languageId?: string;
}): boolean {
  return (
    normalizeProductionAnswer(input.answer, input.languageId) ===
    normalizeProductionAnswer(input.expected, input.languageId)
  );
}
