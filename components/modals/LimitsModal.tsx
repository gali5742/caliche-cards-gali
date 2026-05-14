"use client";

import type { Dispatch, SetStateAction } from "react";

export type LimitsModalState = {
  libraryId: string;
  deckId: number;
  newPerDay: string;
  reviewsPerDay: string;
  easeFactor: string;
  originalEaseFactor: string;
};

const EASE_PRESETS = [1.3, 1.5, 2.0, 2.5, 3.0];

export function LimitsModal({
  modal,
  setModal,
  onSave,
}: {
  modal: LimitsModalState | null;
  setModal: Dispatch<SetStateAction<LimitsModalState | null>>;
  onSave: (modal: LimitsModalState) => void;
}) {
  if (!modal) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
    >
      <div className="w-full max-w-xs rounded-2xl bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Daily limits</h2>
          <button
            type="button"
            onClick={() => setModal(null)}
            className="rounded-full p-1 text-foreground/50 hover:bg-foreground/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-foreground/70">New cards / day</label>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={modal.newPerDay}
              onChange={(e) => setModal((m) => m ? { ...m, newPerDay: e.target.value } : m)}
              className="mt-1 w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-foreground/70">Review cards / day</label>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={modal.reviewsPerDay}
              onChange={(e) => setModal((m) => m ? { ...m, reviewsPerDay: e.target.value } : m)}
              className="mt-1 w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-foreground/70">Ease factor (interval multiplier)</label>
            <div className="mt-1 flex items-center gap-2">
              {EASE_PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setModal((m) => m ? { ...m, easeFactor: String(v) } : m)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    Number(modal.easeFactor) === v
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/15 bg-background text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {v}×
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="mt-5 h-11 w-full rounded-full bg-foreground text-sm font-medium text-background hover:opacity-90"
          onClick={() => {
            onSave(modal);
            setModal(null);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
