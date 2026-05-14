"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { DeckConfig, DeckRef, ReviewAnswerStyle } from "./studyTypes";
import {
  getDeckConfig,
  getDeckOverview,
  setDeckAnswerStyles,
  setDeckCardInfoOpenByDefault,
  setDeckEaseFactor,
  setDeckHiddenFieldLabels,
  setDeckNewPerDay,
  setDeckPinnedBackFieldLabels,
  setDeckReviewsPerDay,
  setDeckWriteLanguage,
  type DeckOverview,
} from "./studyApi";
import { DEFAULT_DECK_CONFIG } from "./scheduler";

export function useDeckConfigActions({
  reviewRef,
  setDeckOverviews,
  setReviewOverview,
  setReviewDeckConfig,
}: {
  reviewRef: DeckRef | null;
  setDeckOverviews: Dispatch<SetStateAction<Record<string, DeckOverview>>>;
  setReviewOverview: Dispatch<SetStateAction<DeckOverview | null>>;
  setReviewDeckConfig: Dispatch<SetStateAction<DeckConfig | null>>;
}) {
  async function syncReviewState(libraryId: string, deckId: number, ov: DeckOverview) {
    if (reviewRef?.libraryId === libraryId && reviewRef.deckId === deckId) {
      setReviewOverview(ov);
      const cfg = await getDeckConfig({ libraryId, deckId });
      setReviewDeckConfig(cfg);
    }
  }

  async function refreshOverview(libraryId: string, deckId: number): Promise<DeckOverview> {
    const ov = await getDeckOverview({ libraryId, deckId });
    setDeckOverviews((prev) => ({ ...prev, [`${libraryId}:${deckId}`]: ov }));
    await syncReviewState(libraryId, deckId, ov);
    return ov;
  }

  const commitNewPerDay = useCallback(
    async (libraryId: string, deckId: number, raw: string) => {
      const next = Number(raw);
      await setDeckNewPerDay({ libraryId, deckId }, next);
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, config: { ...existing.config, newPerDay: Math.max(0, Math.floor(next || 0)) } } };
      });
      await refreshOverview(libraryId, deckId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewRef]
  );

  const commitReviewsPerDay = useCallback(
    async (libraryId: string, deckId: number, raw: string) => {
      const next = Number(raw);
      await setDeckReviewsPerDay({ libraryId, deckId }, next);
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, config: { ...existing.config, reviewsPerDay: Math.max(0, Math.floor(next || 0)) } } };
      });
      await refreshOverview(libraryId, deckId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewRef]
  );

  const commitCardInfoDefaultOpen = useCallback(
    async (libraryId: string, deckId: number, next: boolean) => {
      await setDeckCardInfoOpenByDefault({ libraryId, deckId }, next);
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, config: { ...existing.config, cardInfoOpenByDefault: Boolean(next) } } };
      });
      await refreshOverview(libraryId, deckId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewRef]
  );

  const commitDeckEaseFactor = useCallback(
    async (libraryId: string, deckId: number, raw: string) => {
      const next = Number(raw);
      await setDeckEaseFactor({ libraryId, deckId }, next);
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, config: { ...existing.config, easeFactor: Number.isFinite(next) && next > 0 ? next : DEFAULT_DECK_CONFIG.easeFactor } } };
      });
      await refreshOverview(libraryId, deckId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewRef]
  );

  const commitDeckAnswerStyles = useCallback(
    async (libraryId: string, deckId: number, next: ReviewAnswerStyle[]) => {
      await setDeckAnswerStyles({ libraryId, deckId }, next);
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, config: { ...existing.config, answerStyles: next } } };
      });
      await refreshOverview(libraryId, deckId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewRef]
  );

  const commitDeckWriteLanguage = useCallback(
    async (libraryId: string, deckId: number, next: DeckConfig["writeLanguage"]) => {
      await setDeckWriteLanguage({ libraryId, deckId }, next);
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, config: { ...existing.config, writeLanguage: next } } };
      });
      await refreshOverview(libraryId, deckId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewRef]
  );

  const commitDeckHiddenFieldLabels = useCallback(
    async (libraryId: string, deckId: number, next: string[]) => {
      await setDeckHiddenFieldLabels({ libraryId, deckId }, next);
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, config: { ...existing.config, hiddenFieldLabels: next } } };
      });
      await refreshOverview(libraryId, deckId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewRef]
  );

  const commitDeckPinnedBackFieldLabels = useCallback(
    async (libraryId: string, deckId: number, next: string[]) => {
      await setDeckPinnedBackFieldLabels({ libraryId, deckId }, next);
      setDeckOverviews((prev) => {
        const key = `${libraryId}:${deckId}`;
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, config: { ...existing.config, pinnedBackFieldLabels: next } } };
      });
      await refreshOverview(libraryId, deckId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewRef]
  );

  return {
    commitNewPerDay,
    commitReviewsPerDay,
    commitCardInfoDefaultOpen,
    commitDeckEaseFactor,
    commitDeckAnswerStyles,
    commitDeckWriteLanguage,
    commitDeckHiddenFieldLabels,
    commitDeckPinnedBackFieldLabels,
  };
}
