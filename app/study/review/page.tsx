"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { MobileStudyReview } from "../../../components/study/MobileStudyReview";

function ReviewRoute() {
  const searchParams = useSearchParams();
  const languageId = searchParams.get("language") ?? undefined;
  const collectionId = searchParams.get("collection") ?? undefined;
  const rawBook = searchParams.get("book");
  const parsedBook = rawBook ? Number(rawBook) : null;
  const book = parsedBook && Number.isInteger(parsedBook) ? parsedBook : null;
  const mode = searchParams.get("mode") === "practice" ? "practice" : "scheduled";

  return (
    <MobileStudyReview
      languageId={languageId}
      collectionId={collectionId}
      book={book}
      mode={mode}
    />
  );
}

export default function StudyReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-[#07111d] px-6 text-sm text-slate-500">
          正在打开复习…
        </main>
      }
    >
      <ReviewRoute />
    </Suspense>
  );
}
