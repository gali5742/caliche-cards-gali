"use client";

import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { FaTimes } from "react-icons/fa";

import type { DeckConfig, DeckRef, NextCard, ReviewAnswerStyle } from "../lib/studyTypes";
import type { DeckOverview } from "../lib/studyApi";
import { formatIn } from "../lib/cardUtils";
import { CardFace, FieldsList } from "./CardDisplay";
import { SoundButton } from "./SoundButton";
import { WriteMode } from "./review/WriteMode";
import { MultipleChoiceMode } from "./review/MultipleChoiceMode";
import { ReverseMode } from "./review/ReverseMode";
import { MatchMode } from "./review/MatchMode";
import type { MatchItem } from "../lib/reviewPreloaders";

type WriteDrag = { fromIdx: number; ch: string; x: number; y: number; dropIdx: number };
type McOption = { label: string; isCorrect: boolean };
type ReverseOption = { label: string; isCorrect: boolean };
type PinnedSection = { index: number; label: string; valueHtml: string; suppressFirstSoundFilename: string | null };
type FieldSection = { index: number; label: string; valueHtml: string };

export function ReviewPanel({
  currentMissingFields,
  selectedDeckName,
  reviewOverview,
  nowTs,
  current,
  currentId,
  showAnswer,
  setShowAnswer,
  reviewAnswerStyle,
  reviewBusy,
  reviewDeckConfig,
  activeHiddenNorm,
  activeNamespace,
  reviewRef,
  nextDueLabels,
  currentTimingTag,
  promotedSound,
  isReverseAudioLocked,
  writeIsAvailable,
  writePicked,
  setWritePicked,
  writeDrag,
  setWriteDrag,
  writeDragRef,
  writePickedRefs,
  writeOutcome,
  setWriteOutcome,
  writeBank,
  writeUsed,
  writeExpectedChars,
  mcOptions,
  mcOutcome,
  mcSelectedIndex,
  setMcSelectedIndex,
  setMcOutcome,
  mcCanRun,
  reverseOptions,
  reverseOutcome,
  reverseSelectedIndex,
  setReverseSelectedIndex,
  setReverseOutcome,
  reverseCanRun,
  reversePromptHtml,
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
  pinnedBackRender,
  pinnedBackSections,
  answerFieldSectionsWithoutPinned,
  answerFieldLabelsWithoutPinned,
  onAnswer,
  onExit,
  onShowCountersInfo,
}: {
  currentMissingFields: boolean;
  selectedDeckName: string | null;
  reviewOverview: DeckOverview | null;
  nowTs: number;
  current: NextCard | null;
  currentId: number | null;
  showAnswer: boolean;
  setShowAnswer: Dispatch<SetStateAction<boolean>>;
  reviewAnswerStyle: ReviewAnswerStyle;
  reviewBusy: boolean;
  reviewDeckConfig: DeckConfig | null;
  activeHiddenNorm: Set<string>;
  activeNamespace: string;
  reviewRef: DeckRef | null;
  nextDueLabels: { fail: string; pass: string } | null;
  currentTimingTag: { kind: string; label: string; detail: string | null } | null;
  promotedSound: { filename: string; source: "front" | "back" } | null;
  isReverseAudioLocked: boolean;
  writeIsAvailable: boolean;
  writePicked: Array<{ index: number; ch: string }>;
  setWritePicked: Dispatch<SetStateAction<Array<{ index: number; ch: string }>>>;
  writeDrag: WriteDrag | null;
  setWriteDrag: Dispatch<SetStateAction<WriteDrag | null>>;
  writeDragRef: RefObject<WriteDrag | null>;
  writePickedRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
  writeOutcome: "correct" | "wrong" | null;
  setWriteOutcome: Dispatch<SetStateAction<"correct" | "wrong" | null>>;
  writeBank: string[];
  writeUsed: Set<number>;
  writeExpectedChars: string[];
  mcOptions: McOption[];
  mcOutcome: "correct" | "wrong" | null;
  mcSelectedIndex: number | null;
  setMcSelectedIndex: Dispatch<SetStateAction<number | null>>;
  setMcOutcome: Dispatch<SetStateAction<"correct" | "wrong" | null>>;
  mcCanRun: boolean;
  reverseOptions: ReverseOption[];
  reverseOutcome: "correct" | "wrong" | null;
  reverseSelectedIndex: number | null;
  setReverseSelectedIndex: Dispatch<SetStateAction<number | null>>;
  setReverseOutcome: Dispatch<SetStateAction<"correct" | "wrong" | null>>;
  reverseCanRun: boolean;
  reversePromptHtml: string | null;
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
  setMatchCardPreview: Dispatch<SetStateAction<{ item: MatchItem; card: import("../lib/studyTypes").CardEntity } | null>>;
  pinnedBackRender: { sections: PinnedSection[]; didSuppressPromotedBackSound: boolean };
  pinnedBackSections: FieldSection[];
  answerFieldSectionsWithoutPinned: FieldSection[];
  answerFieldLabelsWithoutPinned: string[];
  onAnswer: (result: "fail" | "pass") => Promise<void>;
  onExit: () => void;
  onShowCountersInfo: () => void;
}) {
  return (
    <main className="caliche-panel rounded-3xl p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        {currentMissingFields ? (
          <div className="caliche-alert rounded-2xl px-4 py-3 text-sm">
            This deck was saved with an older version and is missing some
            fields. Click <span className="font-medium">Clear all</span>{" "}
            and re-import the <span className="font-medium">.apkg</span>.
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-foreground/70">Deck</div>
            <div className="text-sm font-medium">{selectedDeckName ?? "(unnamed)"}</div>
            <div className="mt-1 text-xs text-foreground/70">
              New/day: {reviewOverview?.config.newPerDay ?? "—"} • Review/day: {reviewOverview?.config.reviewsPerDay ?? "—"}
              {reviewOverview ? ` • Words: ${reviewOverview.reviewed}/${reviewOverview.total}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onShowCountersInfo}
                aria-label="What do these numbers mean?"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-foreground/30 text-xs text-foreground/50 hover:border-foreground/60 hover:text-foreground/80"
              >
                i
              </button>
              <div className="text-sm text-foreground/70">
                Due:{" "}
                {reviewOverview ? reviewOverview.learningDue + reviewOverview.reviewShown : 0}
                {reviewOverview ? (
                  <>
                    {" "}• New: {reviewOverview.newShown}
                    {" "}• Learning: {reviewOverview.learningDue}
                    {" "}• Review: {reviewOverview.reviewShown}
                  </>
                ) : null}
                {reviewOverview && reviewOverview.learningWaiting > 0 ? (
                  <> {" "}• Waiting: {reviewOverview.learningWaiting}</>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5"
              title="Exit"
              aria-label="Exit"
            >
              <FaTimes className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {current ? (
          <div className="relative overflow-hidden rounded-3xl border border-foreground/15 bg-surface-strong/70 p-6 shadow-[0_18px_50px_-30px_rgba(6,18,33,0.55)]">
            {currentTimingTag ? (
              <div className="absolute left-4 top-4 text-xs text-foreground/60">
                <span
                  className={`font-semibold ${
                    currentTimingTag.kind === "new"
                      ? "text-blue-400"
                      : currentTimingTag.kind === "due"
                        ? "text-yellow-500"
                        : "text-foreground"
                  }`}
                >
                  {currentTimingTag.label}
                </span>
                {currentTimingTag.detail ? (
                  <span className="text-foreground/60"> {currentTimingTag.detail}</span>
                ) : null}
              </div>
            ) : null}

            {promotedSound?.filename ? (
              <div className="absolute right-4 top-4">
                <SoundButton
                  namespace={activeNamespace}
                  filename={promotedSound.filename}
                  variant="icon"
                  disabled={isReverseAudioLocked}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-6">
              {reviewAnswerStyle === "write" && !showAnswer ? (
                <WriteMode
                  writeIsAvailable={writeIsAvailable}
                  writePicked={writePicked}
                  setWritePicked={setWritePicked}
                  writeDrag={writeDrag}
                  setWriteDrag={setWriteDrag}
                  writeDragRef={writeDragRef}
                  writePickedRefs={writePickedRefs}
                  writeOutcome={writeOutcome}
                  setWriteOutcome={setWriteOutcome}
                  reviewBusy={reviewBusy}
                  writeBank={writeBank}
                  writeUsed={writeUsed}
                  writeExpectedChars={writeExpectedChars}
                  currentId={currentId ?? undefined}
                />
              ) : reviewAnswerStyle === "reverse" && !showAnswer ? (
                <div className="py-10">
                  <CardFace
                    namespace={activeNamespace}
                    html={reversePromptHtml ?? current.card.backHtml}
                    suppressFirstSoundFilename={
                      promotedSound?.source === "back" ? promotedSound.filename : null
                    }
                    soundDisabled={isReverseAudioLocked}
                    className="text-center text-xl leading-8"
                  />
                </div>
              ) : reviewAnswerStyle === "match" && !showAnswer ? null : (
                <div className="py-10">
                  <CardFace
                    namespace={activeNamespace}
                    html={current.card.frontHtml}
                    suppressFirstSoundFilename={
                      promotedSound?.source === "front" ? promotedSound.filename : null
                    }
                    className="text-center text-4xl font-semibold leading-tight tracking-tight"
                  />
                </div>
              )}

              {reviewAnswerStyle === "multiple-choice" && !showAnswer ? (
                <MultipleChoiceMode
                  mcOptions={mcOptions}
                  mcOutcome={mcOutcome}
                  mcSelectedIndex={mcSelectedIndex}
                  setMcSelectedIndex={setMcSelectedIndex}
                  setMcOutcome={setMcOutcome}
                  mcCanRun={mcCanRun}
                  reviewBusy={reviewBusy}
                  currentId={currentId ?? undefined}
                />
              ) : null}

              {reviewAnswerStyle === "reverse" && !showAnswer ? (
                <ReverseMode
                  reverseOptions={reverseOptions}
                  reverseOutcome={reverseOutcome}
                  reverseSelectedIndex={reverseSelectedIndex}
                  setReverseSelectedIndex={setReverseSelectedIndex}
                  setReverseOutcome={setReverseOutcome}
                  reverseCanRun={reverseCanRun}
                  reviewBusy={reviewBusy}
                  currentId={currentId ?? undefined}
                />
              ) : null}

              {reviewAnswerStyle === "match" && !showAnswer ? (
                <MatchMode
                  matchItems={matchItems}
                  matchRightOrder={matchRightOrder}
                  matchAssigned={matchAssigned}
                  setMatchAssigned={setMatchAssigned}
                  matchSubmitted={matchSubmitted}
                  setMatchSubmitted={setMatchSubmitted}
                  matchOutcome={matchOutcome}
                  setMatchOutcome={setMatchOutcome}
                  matchCardResults={matchCardResults}
                  setMatchCardResults={setMatchCardResults}
                  setMatchCardPreview={setMatchCardPreview}
                  reviewBusy={reviewBusy}
                  reviewRef={reviewRef}
                  activeNamespace={activeNamespace}
                  onAnswer={onAnswer}
                />
              ) : null}

              {showAnswer ? (
                <div className="border-t border-foreground/15 pt-6">
                  <>
                    {pinnedBackSections.length > 0 ? (
                      <div className="mb-6 flex flex-col gap-4">
                        {pinnedBackRender.sections.map((sec) => (
                          <div key={`pinned-${sec.index}-${sec.label}`}>
                            <div className="mb-1 text-xs text-center font-medium text-foreground/60">
                              {sec.label}:
                            </div>
                            <CardFace
                              namespace={activeNamespace}
                              html={sec.valueHtml}
                              suppressFirstSoundFilename={sec.suppressFirstSoundFilename}
                              className="text-center text-xl leading-8"
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {answerFieldSectionsWithoutPinned.length > 0 ? (
                      <div className="flex flex-col gap-4">
                        {answerFieldSectionsWithoutPinned.map((sec, idx) => (
                          <div key={`${sec.index}-${sec.label}`}>
                            <div className="mb-1 text-xs text-center font-medium text-foreground/60">
                              {sec.label}:
                            </div>
                            <CardFace
                              namespace={activeNamespace}
                              html={sec.valueHtml}
                              suppressFirstSoundFilename={
                                idx === 0 &&
                                !pinnedBackRender.didSuppressPromotedBackSound &&
                                promotedSound?.source === "back"
                                  ? promotedSound.filename
                                  : null
                              }
                              className="text-center text-xl leading-8"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        {answerFieldLabelsWithoutPinned.length > 0 ? (
                          <div className="mb-3 text-xs font-medium text-foreground/60">
                            {answerFieldLabelsWithoutPinned.join(" • ")}
                          </div>
                        ) : null}
                        {pinnedBackSections.length === 0 ? (
                          <CardFace
                            namespace={activeNamespace}
                            html={current.card.backHtml}
                            suppressFirstSoundFilename={
                              !pinnedBackRender.didSuppressPromotedBackSound &&
                              promotedSound?.source === "back"
                                ? promotedSound.filename
                                : null
                            }
                            className="text-center text-xl leading-8"
                          />
                        ) : null}
                      </>
                    )}
                  </>
                </div>
              ) : null}

              {showAnswer ? (
                <FieldsList
                  key={`${activeNamespace}:${reviewRef?.deckId ?? current.card.deckId}`}
                  namespace={activeNamespace}
                  fields={current.card.fieldsHtml}
                  names={current.card.fieldNames}
                  defaultOpen={Boolean(reviewDeckConfig?.cardInfoOpenByDefault)}
                  hiddenNorm={activeHiddenNorm}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="caliche-alert rounded-2xl px-4 py-6 text-center">
            <div className="text-lg font-semibold">All done for today!</div>
            <div className="mt-1 text-sm text-foreground/70">
              {reviewOverview?.nextAvailableTs != null || reviewOverview?.nextDueTs != null ? (
                (() => {
                  const nextTs = reviewOverview?.nextAvailableTs ?? reviewOverview?.nextDueTs ?? nowTs;
                  const inLabel = formatIn(nextTs, nowTs);
                  const atLabel = new Date(nextTs).toLocaleTimeString();
                  const waiting = reviewOverview.learningWaiting;
                  return (
                    <>
                      Next card in <span className="font-medium">{inLabel}</span>
                      <span className="text-foreground/60"> (at {atLabel})</span>
                      {waiting > 0 ? (
                        <> {" "}• Waiting: <span className="font-medium">{waiting}</span></>
                      ) : null}
                    </>
                  );
                })()
              ) : (
                <>No more cards ready (or you hit today's limits).</>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          {current ? (
            !showAnswer ? (
              reviewAnswerStyle === "normal" ||
              (reviewAnswerStyle === "write" && !writeIsAvailable) ||
              (reviewAnswerStyle === "multiple-choice" && !mcCanRun) ||
              (reviewAnswerStyle === "reverse" && !reverseCanRun) ||
              (reviewAnswerStyle === "match" && matchItems.length < 2) ||
              (reviewAnswerStyle === "write" && writeOutcome != null) ||
              (reviewAnswerStyle === "multiple-choice" && mcOutcome != null) ||
              (reviewAnswerStyle === "reverse" && reverseOutcome != null) ? (
                <button
                  type="button"
                  className="caliche-primary-btn h-12 flex-1 rounded-full px-5 text-sm font-medium"
                  onClick={() => setShowAnswer(true)}
                  disabled={reviewBusy}
                >
                  {(reviewAnswerStyle === "write" && writeOutcome != null) ||
                  (reviewAnswerStyle === "multiple-choice" && mcOutcome != null) ||
                  (reviewAnswerStyle === "reverse" && reverseOutcome != null)
                    ? "Reveal answer"
                    : "Show answer"}
                </button>
              ) : null
            ) : (
              <>
                <button
                  type="button"
                  className="h-12 flex-1 rounded-full border border-red-500 px-5 text-sm font-medium text-red-500 hover:bg-red-500 hover:text-background disabled:pointer-events-none disabled:border-foreground/20 disabled:bg-foreground/5 disabled:text-foreground/40"
                  onClick={() => void onAnswer("fail")}
                  disabled={
                    reviewBusy ||
                    (reviewAnswerStyle === "multiple-choice" && mcOutcome === "correct") ||
                    (reviewAnswerStyle === "reverse" && reverseOutcome === "correct")
                  }
                >
                  Fail{nextDueLabels ? ` • ${nextDueLabels.fail}` : ""}
                </button>
                <button
                  type="button"
                  className="h-12 flex-1 rounded-full border border-green-500 px-5 text-sm font-medium text-green-500 hover:bg-green-500 hover:text-background disabled:pointer-events-none disabled:border-foreground/20 disabled:bg-foreground/5 disabled:text-foreground/40"
                  onClick={() => void onAnswer("pass")}
                  disabled={
                    reviewBusy ||
                    (reviewAnswerStyle === "write" && writeOutcome === "wrong") ||
                    (reviewAnswerStyle === "multiple-choice" && mcOutcome === "wrong") ||
                    (reviewAnswerStyle === "reverse" && reverseOutcome === "wrong")
                  }
                >
                  Pass{nextDueLabels ? ` • ${nextDueLabels.pass}` : ""}
                </button>
              </>
            )
          ) : (
            <button
              type="button"
              className="caliche-primary-btn h-12 flex-1 rounded-full px-5 text-sm font-medium"
              onClick={onExit}
            >
              Back
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
