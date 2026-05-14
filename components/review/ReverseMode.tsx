"use client";

import type { Dispatch, SetStateAction } from "react";

type ReverseOption = { label: string; isCorrect: boolean };

export function ReverseMode({
  reverseOptions,
  reverseOutcome,
  reverseSelectedIndex,
  setReverseSelectedIndex,
  setReverseOutcome,
  reverseCanRun,
  reviewBusy,
  currentId,
}: {
  reverseOptions: ReverseOption[];
  reverseOutcome: "correct" | "wrong" | null;
  reverseSelectedIndex: number | null;
  setReverseSelectedIndex: Dispatch<SetStateAction<number | null>>;
  setReverseOutcome: Dispatch<SetStateAction<"correct" | "wrong" | null>>;
  reverseCanRun: boolean;
  reviewBusy: boolean;
  currentId: number | undefined;
}) {
  return (
    <div className="pb-2">
      <div className="text-center text-sm text-foreground/70">
        Choose the correct front
      </div>
      {!reverseCanRun ? (
        <div className="mt-3 text-center text-sm text-foreground/70">
          Reverse mode isn't available for this card.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {reverseOptions.map((opt, idx) => (
              <button
                key={`rev-${currentId ?? ""}-${idx}-${opt.label}`}
                type="button"
                disabled={reviewBusy || reverseOutcome != null}
                onClick={() => {
                  if (reviewBusy || reverseOutcome != null) return;
                  setReverseSelectedIndex(idx);
                }}
                className={`min-h-12 rounded-2xl border bg-background px-4 py-3 text-left text-base font-medium disabled:opacity-80 ${
                  reverseOutcome == null
                    ? reverseSelectedIndex === idx
                      ? "border-foreground/60 bg-foreground/5"
                      : "border-foreground/15 hover:bg-foreground/5"
                    : opt.isCorrect
                      ? "border-green-500 bg-green-500/5"
                      : reverseSelectedIndex === idx
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
          {reverseSelectedIndex !== null && reverseOutcome === null && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const selected = reverseOptions[reverseSelectedIndex];
                  if (!selected) return;
                  setReverseOutcome(selected.isCorrect ? "correct" : "wrong");
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
