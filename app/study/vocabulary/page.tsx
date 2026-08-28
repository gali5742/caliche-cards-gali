import { Suspense } from "react";

import { MobileStudyVocabulary } from "../../../components/study/MobileStudyVocabulary";

export default function StudyVocabularyPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-[#07111d] px-6 text-sm text-slate-500">
          正在读取词库…
        </main>
      }
    >
      <MobileStudyVocabulary />
    </Suspense>
  );
}
