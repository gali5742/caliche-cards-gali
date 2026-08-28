import type { VocabularyEntry } from "../../domain/vocabulary/types";

export function VocabularyConjugationTable({
  entry,
  compact = false,
}: {
  entry: VocabularyEntry;
  compact?: boolean;
}) {
  const conjugations = entry.grammar?.verb?.conjugations ?? [];
  if (conjugations.length === 0) return null;

  return (
    <div className={compact ? "mt-4 space-y-3" : "mt-4 space-y-4"}>
      {conjugations.map((conjugation) => (
        <section key={conjugation.id}>
          <div className="text-xs font-medium tracking-[0.06em] text-sky-300/75">
            {conjugation.label}
          </div>
          <div className="mt-2 overflow-hidden rounded-[16px] border border-white/8 bg-black/15">
            {conjugation.forms.map((form, index) => (
              <div
                key={`${form.person ?? index}:${form.form}`}
                className={`px-3 ${compact ? "py-2" : "py-2.5"} ${
                  index > 0 ? "border-t border-white/7" : ""
                }`}
              >
                <div className="text-sm font-medium leading-5 text-slate-200">
                  {form.form}
                </div>
                {form.ipa && (
                  <div className="mt-0.5 text-xs leading-5 text-slate-500">
                    {form.ipa}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
