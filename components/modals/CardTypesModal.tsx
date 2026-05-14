"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ReviewAnswerStyle } from "../../lib/studyTypes";

export type CardTypesModalState = {
  libraryId: string;
  deckId: number;
  styles: ReviewAnswerStyle[];
};

const ALL_STYLES: Array<{ id: ReviewAnswerStyle; label: string }> = [
  { id: "normal", label: "Normal" },
  { id: "write", label: "Write" },
  { id: "multiple-choice", label: "Multiple-choice" },
  { id: "reverse", label: "Reverse" },
  { id: "match", label: "Match" },
];

export function CardTypesModal({
  modal,
  setModal,
  onSave,
}: {
  modal: CardTypesModalState | null;
  setModal: Dispatch<SetStateAction<CardTypesModalState | null>>;
  onSave: (libraryId: string, deckId: number, styles: ReviewAnswerStyle[]) => void;
}) {
  if (!modal) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
    >
      <div className="w-full max-w-xs rounded-2xl bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Type of cards</h2>
          <button
            type="button"
            onClick={() => setModal(null)}
            className="rounded-full p-1 text-foreground/50 hover:bg-foreground/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {(modal.styles.length < 5 || modal.styles.length > 1) && (
          <div className="mb-3 flex gap-2">
            {modal.styles.length < 5 && (
              <button
                type="button"
                className="flex-1 rounded-lg border border-foreground/15 py-1.5 text-xs hover:bg-foreground/5"
                onClick={() => setModal((m) => m ? { ...m, styles: ["normal", "write", "multiple-choice", "reverse", "match"] } : m)}
              >
                Select all
              </button>
            )}
            {modal.styles.length > 1 && (
              <button
                type="button"
                className="flex-1 rounded-lg border border-foreground/15 py-1.5 text-xs hover:bg-foreground/5"
                onClick={() => setModal((m) => m ? { ...m, styles: ["normal"] } : m)}
              >
                Deselect all
              </button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {ALL_STYLES.map((opt) => {
            const checked = modal.styles.includes(opt.id);
            return (
              <label key={opt.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{opt.label}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked}
                  onChange={(e) => {
                    const wants = e.currentTarget.checked;
                    setModal((m) => {
                      if (!m) return m;
                      const base = new Set<ReviewAnswerStyle>(m.styles);
                      if (wants) base.add(opt.id);
                      else base.delete(opt.id);
                      const next = Array.from(base);
                      return { ...m, styles: next.length > 0 ? next : ["normal"] };
                    });
                  }}
                />
              </label>
            );
          })}
        </div>

        <button
          type="button"
          className="mt-5 h-11 w-full rounded-full bg-foreground text-sm font-medium text-background hover:opacity-90"
          onClick={() => {
            onSave(modal.libraryId, modal.deckId, modal.styles);
            setModal(null);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
