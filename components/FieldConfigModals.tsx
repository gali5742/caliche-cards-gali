"use client";

import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { FaTimes } from "react-icons/fa";

export type FieldConfigModalState = {
  type: "hidden" | "pinned";
  libraryId: string;
  deckId: number;
  allFields: string[];
  current: string[];
};

export function FieldConfigModal({
  modal,
  setModal,
  onSaveHidden,
  onSavePinned,
}: {
  modal: FieldConfigModalState | null;
  setModal: Dispatch<SetStateAction<FieldConfigModalState | null>>;
  onSaveHidden: (libraryId: string, deckId: number, next: string[]) => void;
  onSavePinned: (libraryId: string, deckId: number, next: string[]) => void;
}) {
  if (!modal) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-foreground/15 bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {modal.type === "hidden" ? "Hidden fields" : "Pinned back fields"}
          </h2>
          <button
            type="button"
            onClick={() => setModal(null)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-foreground/15 text-foreground/60 hover:bg-foreground/5"
          >
            <FaTimes className="h-3 w-3" />
          </button>
        </div>

        {modal.type === "hidden" ? (
          <HiddenFieldsModalBody
            allFields={modal.allFields}
            current={modal.current}
            onSave={(next) => {
              onSaveHidden(modal.libraryId, modal.deckId, next);
              setModal(null);
            }}
          />
        ) : (
          <PinnedFieldsModalBody
            allFields={modal.allFields}
            current={modal.current}
            onSave={(next) => {
              onSavePinned(modal.libraryId, modal.deckId, next);
              setModal(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

export function HiddenFieldsModalBody({
  allFields,
  current,
  onSave,
}: {
  allFields: string[];
  current: string[];
  onSave: (next: string[]) => void;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(current));

  const toggle = (field: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-foreground/60">
        Hidden fields never appear in Card info during review.
      </p>
      {allFields.length === 0 ? (
        <p className="text-xs text-foreground/50">No fields found for this deck.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-foreground/10">
          {allFields.map((field) => (
            <label
              key={field}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-foreground/5"
            >
              <span className="truncate">{field}</span>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={hidden.has(field)}
                onChange={() => toggle(field)}
              />
            </label>
          ))}
        </div>
      )}
      <button
        type="button"
        className="caliche-primary-btn mt-1 h-10 rounded-full px-6 text-sm font-medium"
        onClick={() => onSave([...hidden])}
      >
        Save
      </button>
    </div>
  );
}

export function PinnedFieldsModalBody({
  allFields,
  current,
  onSave,
}: {
  allFields: string[];
  current: string[];
  onSave: (next: string[]) => void;
}) {
  const [pinned, setPinned] = useState<string[]>(() => current.filter((f) => allFields.includes(f)));

  const available = allFields.filter((f) => !pinned.includes(f));

  const add = (field: string) => setPinned((prev) => [...prev, field]);
  const remove = (idx: number) => setPinned((prev) => prev.filter((_, i) => i !== idx));
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setPinned((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
      return next;
    });
  };
  const moveDown = (idx: number) => {
    setPinned((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-foreground/60">
        Pinned fields appear at the top of the answer. The first one is also used as the Multiple Choice answer source.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-foreground/50">Available</div>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-foreground/10">
            {available.length === 0 ? (
              <p className="px-3 py-2 text-xs text-foreground/40">All fields pinned</p>
            ) : (
              available.map((field) => (
                <button
                  key={field}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-foreground/5"
                  onClick={() => add(field)}
                >
                  <span className="truncate">{field}</span>
                  <span className="shrink-0 text-foreground/40">+</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-foreground/50">Pinned (in order)</div>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-foreground/10">
            {pinned.length === 0 ? (
              <p className="px-3 py-2 text-xs text-foreground/40">None pinned</p>
            ) : (
              pinned.map((field, idx) => (
                <div key={field} className="flex items-center gap-1 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs">{field}</span>
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/40 hover:bg-foreground/10 disabled:opacity-20"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                  >
                    ▴
                  </button>
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/40 hover:bg-foreground/10 disabled:opacity-20"
                    onClick={() => moveDown(idx)}
                    disabled={idx === pinned.length - 1}
                  >
                    ▾
                  </button>
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/40 hover:bg-foreground/10"
                    onClick={() => remove(idx)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="caliche-primary-btn mt-1 h-10 rounded-full px-6 text-sm font-medium"
        onClick={() => onSave(pinned)}
      >
        Save
      </button>
    </div>
  );
}
