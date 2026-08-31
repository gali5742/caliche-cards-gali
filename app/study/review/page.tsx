"use client";

import { Suspense, useMemo, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import { MobileStudyReview } from "../../../components/study/MobileStudyReview";
import styles from "./review.module.css";

function subscribeToLocation() {
  return () => undefined;
}

function ReviewRoute() {
  const searchParams = useSearchParams();
  const browserSearch = useSyncExternalStore(
    subscribeToLocation,
    () => window.location.search,
    () => ""
  );

  const resolvedParams = useMemo(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (
      nextParams.get("language") &&
      nextParams.get("collection") &&
      nextParams.get("book")
    ) {
      return nextParams;
    }

    return new URLSearchParams(browserSearch);
  }, [browserSearch, searchParams]);

  const languageId = resolvedParams.get("language") ?? undefined;
  const collectionId = resolvedParams.get("collection") ?? undefined;
  const rawBook = resolvedParams.get("book");
  const parsedBook = rawBook ? Number(rawBook) : null;
  const book = parsedBook && Number.isInteger(parsedBook) ? parsedBook : null;
  const mode = resolvedParams.get("mode") === "practice" ? "practice" : "scheduled";

  return (
    <div className={styles.viewport}>
      <MobileStudyReview
        languageId={languageId}
        collectionId={collectionId}
        book={book}
        mode={mode}
      />
    </div>
  );
}

export default function StudyReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100svh] items-center justify-center bg-[#07111d] px-6 text-sm text-slate-500">
          正在打开复习…
        </main>
      }
    >
      <ReviewRoute />
    </Suspense>
  );
}
