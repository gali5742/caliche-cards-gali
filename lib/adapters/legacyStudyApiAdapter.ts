import {
  answerCard,
  getDeckOverview,
  getNextCard,
  type DeckOverview,
} from "../studyApi";
import type { DeckRef, NextCard } from "../studyTypes";

export type LegacyNextCardOptions = {
  learnAheadMs?: number;
  learnAheadMode?: "relearn-only" | "learn+relearn";
  excludeCardId?: number;
  skipNew?: boolean;
};

export interface LegacyStudyGateway {
  getOverview(ref: DeckRef): Promise<DeckOverview>;
  getNext(ref: DeckRef, options?: LegacyNextCardOptions): Promise<NextCard | null>;
  answer(ref: DeckRef, cardId: number, result: "pass" | "fail", timeTakenMs?: number): Promise<void>;
}

export class LegacyStudyApiAdapter implements LegacyStudyGateway {
  getOverview(ref: DeckRef): Promise<DeckOverview> {
    return getDeckOverview(ref);
  }

  getNext(ref: DeckRef, options: LegacyNextCardOptions = {}): Promise<NextCard | null> {
    return getNextCard(ref, options);
  }

  answer(
    ref: DeckRef,
    cardId: number,
    result: "pass" | "fail",
    timeTakenMs?: number
  ): Promise<void> {
    return answerCard(ref, cardId, result, timeTakenMs);
  }
}
