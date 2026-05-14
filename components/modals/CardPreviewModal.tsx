"use client";

import { FaTimes } from "react-icons/fa";

import type { CardEntity } from "../../lib/studyTypes";
import { inferFieldSectionsForHtml, pickFieldSectionsByLabel } from "../../lib/cardUtils";
import { CardFace, FieldsList } from "../CardDisplay";
import { SoundButton } from "../SoundButton";
import type { MatchItem } from "../../lib/reviewPreloaders";

export function CardPreviewModal({
  preview,
  onClose,
  namespace,
  learnedCardsLibraryId,
  pinnedNorm,
  hiddenNorm,
  cardInfoOpenByDefault,
}: {
  preview: { item: MatchItem; card: CardEntity } | null;
  onClose: () => void;
  namespace: string;
  learnedCardsLibraryId: string | undefined;
  pinnedNorm: string[];
  hiddenNorm: Set<string>;
  cardInfoOpenByDefault: boolean;
}) {
  if (!preview) return null;

  const previewCard = preview.card;
  const previewNamespace = learnedCardsLibraryId ?? namespace;

  const previewPinnedSections = pickFieldSectionsByLabel({
    fieldsHtml: previewCard.fieldsHtml,
    fieldNames: previewCard.fieldNames,
    labelNormalizedInOrder: pinnedNorm,
  });
  const previewAllSections = inferFieldSectionsForHtml({
    html: previewCard.backHtml,
    fieldsHtml: previewCard.fieldsHtml,
    fieldNames: previewCard.fieldNames,
    hiddenNorm,
  });
  const previewPinnedIndexes = new Set(previewPinnedSections.map((s) => s.index));
  const previewNonPinnedSections = previewAllSections.filter((s) => !previewPinnedIndexes.has(s.index));

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto bg-background"
      onClick={onClose}
    >
      <div className="caliche-container mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:py-12">
        <div
          className="relative overflow-hidden rounded-3xl border border-foreground/15 bg-surface-strong/70 p-6 shadow-[0_18px_50px_-30px_rgba(6,18,33,0.55)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute right-4 top-4 flex items-center gap-2">
            {preview.item.soundFile ? (
              <SoundButton
                namespace={previewNamespace}
                filename={preview.item.soundFile}
                variant="icon"
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 hover:bg-foreground/10"
              aria-label="Close"
            >
              <FaTimes className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-6">
            <div className="py-10">
              <CardFace
                namespace={previewNamespace}
                html={previewCard.frontHtml}
                className="text-center text-4xl font-semibold leading-tight tracking-tight"
              />
            </div>

            <div className="border-t border-foreground/15 pt-6">
              {previewPinnedSections.length > 0 ? (
                <div className="mb-6 flex flex-col gap-4">
                  {previewPinnedSections.map((sec) => (
                    <div key={`pinned-${sec.index}-${sec.label}`}>
                      <div className="mb-1 text-xs text-center font-medium text-foreground/60">
                        {sec.label}:
                      </div>
                      <CardFace
                        namespace={previewNamespace}
                        html={sec.valueHtml}
                        className="text-center text-xl leading-8"
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {previewNonPinnedSections.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {previewNonPinnedSections.map((sec) => (
                    <div key={`${sec.index}-${sec.label}`}>
                      <div className="mb-1 text-xs text-center font-medium text-foreground/60">
                        {sec.label}:
                      </div>
                      <CardFace
                        namespace={previewNamespace}
                        html={sec.valueHtml}
                        className="text-center text-xl leading-8"
                      />
                    </div>
                  ))}
                </div>
              ) : previewPinnedSections.length === 0 ? (
                <CardFace
                  namespace={previewNamespace}
                  html={previewCard.backHtml}
                  className="text-center text-xl leading-8"
                />
              ) : null}
            </div>

            <FieldsList
              namespace={previewNamespace}
              fields={previewCard.fieldsHtml}
              names={previewCard.fieldNames}
              defaultOpen={cardInfoOpenByDefault}
              hiddenNorm={hiddenNorm}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
