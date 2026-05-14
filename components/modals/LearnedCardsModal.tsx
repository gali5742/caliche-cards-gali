"use client";

import type { Dispatch, SetStateAction } from "react";
import { FaTimes } from "react-icons/fa";

import type { CardEntity } from "../../lib/studyTypes";
import { htmlToText } from "../../lib/cardUtils";
import type { MatchItem } from "../../lib/reviewPreloaders";

export type LearnedCardsModalState = {
  libraryId: string;
  deckId: number;
  tab: "all" | "learning" | "review";
  cards: Array<{ card: CardEntity; state: string; intervalDays: number; due: number }>;
};

export function LearnedCardsModal({
  modal,
  setModal,
  onPreviewCard,
}: {
  modal: LearnedCardsModalState | null;
  setModal: Dispatch<SetStateAction<LearnedCardsModalState | null>>;
  onPreviewCard: (item: MatchItem, card: CardEntity) => void;
}) {
  if (!modal) return null;

  const lcm = modal;
  const reviewCards = lcm.cards.filter((p) => p.state === "review").sort((a, b) => b.intervalDays - a.intervalDays);
  const learningCards = lcm.cards.filter((p) => p.state === "learn" || p.state === "relearn").sort((a, b) => a.due - b.due);
  const visibleCards =
    lcm.tab === "review" ? reviewCards
    : lcm.tab === "learning" ? learningCards
    : [...reviewCards, ...learningCards];

  const tabs: Array<{ id: typeof lcm.tab; label: string; count: number }> = [
    { id: "all", label: "All", count: lcm.cards.length },
    { id: "review", label: "Review", count: reviewCards.length },
    { id: "learning", label: "Learning", count: learningCards.length },
  ];

  const renderCardRow = (p: { card: CardEntity; state: string; intervalDays: number }) => {
    const front = htmlToText(p.card.frontHtml).replace(/\[sound:[^\]]+\]/gi, "").trim();
    const soundMatch =
      /\[sound:([^\]]+)\]/i.exec(p.card.frontHtml) ??
      /\[sound:([^\]]+)\]/i.exec(p.card.backHtml);
    return (
      <button
        key={p.card.cardId}
        type="button"
        className="flex items-center justify-between rounded-2xl border border-foreground/10 bg-surface-strong/50 px-4 py-3 text-left hover:bg-foreground/5 transition-colors"
        onClick={() => {
          const item: MatchItem = {
            cardId: p.card.cardId,
            front,
            back: "",
            soundFile: soundMatch?.[1]?.trim() ?? undefined,
          };
          onPreviewCard(item, p.card);
        }}
      >
        <span className="font-medium">
          {front}
          {soundMatch ? <span className="ml-1 text-foreground/40 text-xs">♪</span> : null}
        </span>
        <span className="text-xs text-foreground/40 shrink-0 ml-3">
          {p.state === "review"
            ? `${p.intervalDays}d`
            : p.state === "relearn"
              ? "Relearn"
              : "Learning"}
        </span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto bg-background"
      onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
    >
      <div className="caliche-container mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-10 sm:py-12">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Studied cards</h2>
          <button
            type="button"
            onClick={() => setModal(null)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 hover:bg-foreground/10"
          >
            <FaTimes className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 rounded-xl bg-surface-strong/50 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setModal((prev) => prev ? { ...prev, tab: t.id } : prev)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                lcm.tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground/80"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs opacity-60">{t.count}</span>
            </button>
          ))}
        </div>

        {visibleCards.length === 0 ? (
          <p className="text-center text-sm text-foreground/50 py-10">No cards in this category yet.</p>
        ) : lcm.tab === "all" ? (
          <div className="flex flex-col gap-4">
            {reviewCards.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40 px-1">
                  Review — {reviewCards.length}
                </p>
                {reviewCards.map(renderCardRow)}
              </div>
            )}
            {learningCards.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40 px-1">
                  Learning — {learningCards.length}
                </p>
                {learningCards.map(renderCardRow)}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleCards.map(renderCardRow)}
          </div>
        )}
      </div>
    </div>
  );
}
