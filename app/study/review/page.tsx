"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { MobileStudyReview } from "../../../components/study/MobileStudyReview";

function ReviewRoute() {
  const searchParams = useSearchParams();
  const [browserSearch, setBrowserSearch] = useState<string | null>(null);

  useEffect(() => {
    setBrowserSearch(window.location.search);
  }, []);

  const resolvedParams = useMemo(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (
      nextParams.get("language") &&
      nextParams.get("collection") &&
      nextParams.get("book")
    ) {
      return nextParams;
    }

    if (browserSearch === null) return null;
    const browserParams = new URLSearchParams(browserSearch);
    return browserParams;
  }, [browserSearch, searchParams]);

  if (resolvedParams === null) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#07111d] px-6 text-sm text-slate-500">
        正在打开复习…
      </main>
    );
  }

  const languageId = resolvedParams.get("language") ?? undefined;
  const collectionId = resolvedParams.get("collection") ?? undefined;
  const rawBook = resolvedParams.get("book");
  const parsedBook = rawBook ? Number(rawBook) : null;
  const book = parsedBook && Number.isInteger(parsedBook) ? parsedBook : null;
  const mode = resolvedParams.get("mode") === "practice" ? "practice" : "scheduled";

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
