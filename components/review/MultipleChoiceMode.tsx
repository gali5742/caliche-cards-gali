"use client";

import type { Dispatch, SetStateAction } from "react";

type McOption = { label: string; isCorrect: boolean };

export function MultipleChoiceMode({
  mcOptions,
  mcOutcome,
  mcSelectedIndex,
  setMcSelectedIndex,
  setMcOutcome,
  mcCanRun,
  reviewBusy,
  currentId,
}: {
  mcOptions: McOption[];
  mcOutcome: "correct" | "wrong" | null;
  mcSelectedIndex: number | null;
  setMcSelectedIndex: Dispatch<SetStateAction<number | null>>;
  setMcOutcome: Dispatch<SetStateAction<"correct" | "wrong" | null>>;
  mcCanRun: boolean;
  reviewBusy: boolean;
  currentId: number | undefined;
}) {
  return (
    <div className="pb-2">
      <div className="text-center text-sm text-foreground/70">
        Choose the correct answer
      </div>
      {!mcCanRun ? (
        <div className="mt-3 text-center text-sm text-foreground/70">
          Multiple-choice isn't available for this card.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {mcOptions.map((opt, idx) => (
              <button
                key={`mc-${currentId ?? ""}-${idx}-${opt.label}`}
                type="button"
                disabled={reviewBusy || mcOutcome != null}
                onClick={() => {
                  if (reviewBusy || mcOutcome != null) return;
                  setMcSelectedIndex(idx);
                }}
                className={`min-h-12 rounded-2xl border bg-background px-4 py-3 text-left text-base font-medium disabled:opacity-80 ${
                  mcOutcome == null
                    ? mcSelectedIndex === idx
                      ? "border-foreground/60 bg-foreground/5"
                      : "border-foreground/15 hover:bg-foreground/5"
                    : opt.isCorrect
                      ? "border-green-500 bg-green-500/5"
                      : mcSelectedIndex === idx
                        ? "border-red-500 bg-red-500/5"
                        : "border-foreground/10 opacity-60"
                }`}
              >
                <span className="mr-2 text-foreground/60">
                  {String.fromCharCode(65 + (idx % 26))}.
                </span>
                {opt.label}
              </button>
            ))}
          </div>
          {mcSelectedIndex !== null && mcOutcome === null && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const selected = mcOptions[mcSelectedIndex];
                  if (!selected) return;
                  setMcOutcome(selected.isCorrect ? "correct" : "wrong");
                }}
                className="caliche-primary-btn h-11 rounded-full px-8 text-sm font-medium"
              >
                Submit
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
