"use client";

import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

type WriteDrag = { fromIdx: number; ch: string; x: number; y: number; dropIdx: number };

type WritePicked = Array<{ index: number; ch: string }>;

export function WriteMode({
  writeIsAvailable,
  writePicked,
  setWritePicked,
  writeDrag,
  setWriteDrag,
  writeDragRef,
  writePickedRefs,
  writeOutcome,
  setWriteOutcome,
  reviewBusy,
  writeBank,
  writeUsed,
  writeExpectedChars,
  currentId,
}: {
  writeIsAvailable: boolean;
  writePicked: WritePicked;
  setWritePicked: Dispatch<SetStateAction<WritePicked>>;
  writeDrag: WriteDrag | null;
  setWriteDrag: Dispatch<SetStateAction<WriteDrag | null>>;
  writeDragRef: RefObject<WriteDrag | null>;
  writePickedRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
  writeOutcome: "correct" | "wrong" | null;
  setWriteOutcome: Dispatch<SetStateAction<"correct" | "wrong" | null>>;
  reviewBusy: boolean;
  writeBank: string[];
  writeUsed: Set<number>;
  writeExpectedChars: string[];
  currentId: number | undefined;
}) {
  return (
    <div className="py-6">
      <div className="text-center text-sm text-foreground/70">
        Click (or Tab to) the letters to write the word
      </div>
      {!writeIsAvailable ? (
        <div className="mt-3 text-center text-sm text-foreground/70">
          Write mode isn't available for this card.
        </div>
      ) : (
        <>
          <div className="mt-4 flex justify-center">
            <div
              className={`min-h-14 rounded-2xl border bg-background px-5 py-3 text-center text-3xl font-semibold tracking-widest ${
                writeOutcome == null
                  ? "border-foreground/15"
                  : writeOutcome === "correct"
                    ? "border-green-500 bg-green-500/5"
                    : "border-red-500 bg-red-500/5"
              }`}
            >
              {writePicked.length > 0 ? (
                <div
                  className="flex flex-wrap justify-center gap-2"
                  style={{ touchAction: "none" }}
                >
                  {writePicked.map((p, pickedIdx) => {
                    const isDragging = writeDrag?.fromIdx === pickedIdx;
                    const showDropBefore =
                      writeDrag !== null &&
                      writeDrag.dropIdx === pickedIdx &&
                      !isDragging &&
                      writeDrag.dropIdx !== writeDrag.fromIdx + 1;
                    return (
                      <span key={`picked-${currentId ?? ""}-${pickedIdx}-${p.index}-${p.ch}`} className="flex items-center">
                        {showDropBefore && (
                          <span className="mr-1 h-10 w-1 rounded-full bg-blue-500 sm:h-12" />
                        )}
                        <span className="relative">
                          {writeOutcome == null && (
                            <button
                              type="button"
                              disabled={reviewBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                setWritePicked((prev) => prev.filter((_, i) => i !== pickedIdx));
                              }}
                              className="absolute -right-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-foreground/25 text-foreground/50 shadow-sm hover:border-red-400 hover:text-red-400 disabled:opacity-40 transition-colors"
                              aria-label={`Remove ${p.ch}`}
                            >
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true"><line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </button>
                          )}
                          <button
                            ref={(el) => { writePickedRefs.current[pickedIdx] = el; }}
                            type="button"
                            disabled={reviewBusy || writeOutcome != null}
                            onPointerDown={(e) => {
                              if (reviewBusy || writeOutcome != null) return;
                              e.preventDefault();
                              const state = { fromIdx: pickedIdx, ch: p.ch, x: e.clientX, y: e.clientY, dropIdx: pickedIdx };
                              writeDragRef.current = state;
                              setWriteDrag(state);
                            }}
                            aria-label={p.ch === " " ? "space" : p.ch}
                            className={`inline-flex h-10 min-w-10 cursor-grab items-center justify-center rounded-2xl border px-2 text-lg transition-opacity active:cursor-grabbing disabled:opacity-60 sm:h-12 sm:min-w-12 sm:px-3 sm:text-2xl ${
                              writeOutcome != null
                                ? writeOutcome === "correct"
                                  ? "border-green-500 bg-green-500/10 text-green-500"
                                  : "border-red-500 bg-red-500/10 text-red-500"
                                : isDragging
                                  ? "border-blue-500 bg-blue-500/10 opacity-40"
                                  : "border-foreground/15 bg-foreground/5"
                            }`}
                          >
                            {p.ch === " " ? "␣" : p.ch}
                          </button>
                        </span>
                      </span>
                    );
                  })}
                  {writeDrag !== null &&
                    writeDrag.dropIdx === writePicked.length &&
                    writeDrag.dropIdx !== writeDrag.fromIdx &&
                    writeDrag.dropIdx !== writeDrag.fromIdx + 1 && (
                      <span className="flex items-center">
                        <span className="h-10 w-1 rounded-full bg-blue-500 sm:h-12" />
                      </span>
                  )}
                </div>
              ) : (
                <span className="text-foreground/30">…</span>
              )}
            </div>
          </div>

          {writeDrag !== null && (
            <div
              style={{
                position: "fixed",
                left: writeDrag.x - 24,
                top: writeDrag.y - 24,
                zIndex: 9999,
                pointerEvents: "none",
              }}
              className="flex h-12 min-w-12 items-center justify-center rounded-2xl border-2 border-blue-500 bg-blue-500/20 px-2 text-lg font-semibold text-blue-500 shadow-lg"
            >
              {writeDrag.ch === " " ? "␣" : writeDrag.ch}
            </div>
          )}

          {writePicked.length > 0 && writeOutcome == null && (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                className="rounded-full border border-foreground/20 px-4 py-1 text-xs font-medium text-foreground/50 hover:bg-foreground/5 disabled:opacity-50"
                disabled={reviewBusy}
                onClick={() => {
                  writeDragRef.current = null;
                  setWriteDrag(null);
                  setWritePicked([]);
                }}
              >
                Clear
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {writeBank.map((ch, idx) => {
              const used = writeUsed.has(idx);
              return (
                <button
                  key={`write-${currentId ?? ""}-${idx}-${ch}`}
                  type="button"
                  disabled={reviewBusy || used || writeOutcome != null}
                  onClick={() => {
                    if (reviewBusy) return;
                    if (used) return;
                    if (writeOutcome != null) return;
                    setWritePicked((prev) => [...prev, { index: idx, ch }]);
                  }}
                  className={`h-12 w-12 rounded-2xl border border-foreground/15 text-lg font-semibold hover:bg-foreground/5 disabled:opacity-40 ${
                    used ? "bg-foreground/5" : "bg-background"
                  }`}
                >
                  {ch === " " ? "␣" : ch}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex justify-center">
            <button
              type="button"
              className="caliche-primary-btn h-11 rounded-full px-8 text-sm font-medium disabled:opacity-50"
              disabled={
                reviewBusy ||
                !writeIsAvailable ||
                writePicked.length === 0 ||
                writeOutcome != null
              }
              onClick={() => {
                if (!writeIsAvailable) return;
                if (writePicked.length === 0) return;
                if (writeOutcome != null) return;
                writeDragRef.current = null;
                setWriteDrag(null);
                const expected = writeExpectedChars.join("");
                const answer = writePicked.map((p) => p.ch).join("");
                const ok =
                  answer.normalize("NFKC").toLowerCase() ===
                  expected.normalize("NFKC").toLowerCase();
                setWriteOutcome(ok ? "correct" : "wrong");
              }}
            >
              Submit
            </button>
          </div>
        </>
      )}
    </div>
  );
}
