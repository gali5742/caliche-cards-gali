"use client";

import type { Dispatch, SetStateAction } from "react";
import { FaPlay } from "react-icons/fa";

import { tryPlayAudioFilename } from "../../lib/mediaUtils";
import { getStudyDb } from "../../lib/studyDb";
import type { CardEntity, DeckRef } from "../../lib/studyTypes";

export type MatchItem = { cardId: number; front: string; back: string; soundFile?: string };

export function MatchMode({
  matchItems,
  matchRightOrder,
  matchAssigned,
  setMatchAssigned,
  matchSubmitted,
  setMatchSubmitted,
  matchOutcome,
  setMatchOutcome,
  matchCardResults,
  setMatchCardResults,
  setMatchCardPreview,
  reviewBusy,
  reviewRef,
  activeNamespace,
  onAnswer,
}: {
  matchItems: MatchItem[];
  matchRightOrder: number[];
  matchAssigned: (number | null)[];
  setMatchAssigned: Dispatch<SetStateAction<(number | null)[]>>;
  matchSubmitted: boolean;
  setMatchSubmitted: Dispatch<SetStateAction<boolean>>;
  matchOutcome: "correct" | "wrong" | null;
  setMatchOutcome: Dispatch<SetStateAction<"correct" | "wrong" | null>>;
  matchCardResults: boolean[];
  setMatchCardResults: Dispatch<SetStateAction<boolean[]>>;
  setMatchCardPreview: Dispatch<SetStateAction<{ item: MatchItem; card: CardEntity } | null>>;
  reviewBusy: boolean;
  reviewRef: DeckRef | null;
  activeNamespace: string;
  onAnswer: (result: "fail" | "pass") => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6 pt-6 pb-2">
      {matchItems.length < 2 ? (
        <div className="text-center text-sm text-foreground/70">
          Match is not available for this card.
        </div>
      ) : (
        <>
          {/* Word slots — top */}
          <div>
            <div className="mb-3 flex items-center justify-between px-1 pt-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-foreground/40">Words</span>
              <span className="rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs font-medium text-foreground/50">{matchItems.length} cards</span>
            </div>
            <div className={`grid gap-3 grid-cols-${matchItems.length}`}>
              {matchItems.map((item, slot) => {
                const assignedBottomIdx = matchAssigned[slot] ?? null;
                const assignedItem =
                  assignedBottomIdx !== null
                    ? matchItems[matchRightOrder[assignedBottomIdx] ?? -1] ?? null
                    : null;
                const isCorrect =
                  matchSubmitted &&
                  assignedBottomIdx !== null &&
                  matchRightOrder[assignedBottomIdx] === slot;
                const isWrong =
                  matchSubmitted &&
                  assignedBottomIdx !== null &&
                  matchRightOrder[assignedBottomIdx] !== slot;
                return (
                  <div key={`slot-${slot}`} className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      disabled={!matchSubmitted}
                      onClick={() => {
                        if (!matchSubmitted || !reviewRef) return;
                        const db = getStudyDb();
                        void db.cards.get([reviewRef.libraryId, item.cardId]).then((card) => {
                          if (card) setMatchCardPreview({ item, card });
                        });
                      }}
                      className={`rounded-xl bg-foreground/8 px-2 py-2.5 text-center text-sm font-semibold leading-tight w-full ${matchSubmitted ? "cursor-pointer hover:bg-foreground/15 transition-colors" : ""}`}
                    >
                      {item.front}
                      {item.soundFile ? <span className="ml-1 text-foreground/40 text-xs">♪</span> : null}
                      {matchSubmitted && <span className="ml-1 text-foreground/30 text-xs">↗</span>}
                    </button>
                    <button
                      type="button"
                      disabled={matchSubmitted}
                      onClick={() => {
                        if (matchSubmitted) return;
                        if (assignedBottomIdx !== null) {
                          setMatchAssigned((prev) => {
                            const next = [...prev];
                            next[slot] = null;
                            return next;
                          });
                        }
                      }}
                      className={`min-h-10 rounded-xl border-2 px-2 py-2 text-center text-xs transition-colors ${
                        isCorrect
                          ? "border-green-500 bg-green-500/10 text-green-600"
                          : isWrong
                            ? "border-red-500 bg-red-500/10 text-red-500"
                            : assignedItem
                              ? "border-blue-400/60 bg-blue-400/8 text-foreground hover:bg-red-500/8 hover:border-red-400"
                              : "border-dashed border-foreground/20 text-foreground/25"
                      }`}
                    >
                      {assignedItem ? assignedItem.back : "·  ·  ·"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Answer chips — bottom */}
          <div>
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-foreground/40">Answers</span>
              {matchItems.some((item) => item.soundFile) ? (
                <button
                  type="button"
                  onClick={() => {
                    const firstEmpty = matchAssigned.findIndex((v) => v === null);
                    const idx = firstEmpty !== -1 ? firstEmpty : matchItems.length - 1;
                    const word = matchItems[idx];
                    if (word?.soundFile) {
                      void tryPlayAudioFilename(activeNamespace, word.soundFile).catch(() => {});
                    }
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-foreground/20 text-foreground/50 hover:bg-foreground/8 hover:text-foreground/80 transition-colors"
                  aria-label="Play current word audio"
                >
                  <FaPlay className="h-2.5 w-2.5" />
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {matchRightOrder.map((itemIdx, bottomIdx) => {
                const item = matchItems[itemIdx];
                if (!item) return null;
                const isUsed = matchAssigned.includes(bottomIdx);
                return (
                  <button
                    key={`ans-${bottomIdx}-${item.cardId}`}
                    type="button"
                    disabled={matchSubmitted}
                    onClick={() => {
                      if (matchSubmitted) return;
                      if (isUsed) {
                        setMatchAssigned((prev) =>
                          prev.map((v) => (v === bottomIdx ? null : v))
                        );
                        return;
                      }
                      const firstEmpty = matchAssigned.findIndex((v) => v === null);
                      if (firstEmpty !== -1) {
                        const wordAtSlot = matchItems[firstEmpty];
                        if (wordAtSlot?.soundFile) {
                          void tryPlayAudioFilename(activeNamespace, wordAtSlot.soundFile).catch(() => {});
                        }
                      }
                      setMatchAssigned((prev) => {
                        const next = [...prev];
                        const emptyIdx = next.findIndex((v) => v === null);
                        if (emptyIdx !== -1) next[emptyIdx] = bottomIdx;
                        return next;
                      });
                    }}
                    className={`rounded-2xl border px-4 py-2 text-sm font-medium transition-colors ${
                      isUsed
                        ? "border-foreground/10 bg-foreground/5 text-foreground/30"
                        : "border-foreground/20 bg-background hover:bg-foreground/5 active:bg-foreground/10"
                    }`}
                  >
                    {item.back}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit / Continue */}
          {!matchSubmitted ? (
            <button
              type="button"
              disabled={matchAssigned.some((v) => v === null)}
              onClick={() => {
                setMatchSubmitted(true);
                const perSlot = matchItems.map((_, slot) => {
                  const assigned = matchAssigned[slot];
                  if (assigned === null) return false;
                  return matchRightOrder[assigned] === slot;
                });
                setMatchCardResults(perSlot);
                setMatchOutcome(perSlot.every(Boolean) ? "correct" : "wrong");
              }}
              className="caliche-primary-btn h-11 rounded-full px-6 text-sm font-medium disabled:opacity-40 self-center"
            >
              Submit
            </button>
          ) : (
            <button
              type="button"
              disabled={reviewBusy}
              onClick={() => void onAnswer(matchOutcome === "correct" ? "pass" : "fail")}
              className="caliche-primary-btn h-11 rounded-full px-6 text-sm font-medium self-center"
            >
              Continue
            </button>
          )}
        </>
      )}
    </div>
  );
}
