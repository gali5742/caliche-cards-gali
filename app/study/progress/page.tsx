import { Suspense } from "react";

import { MobileStudyProgress } from "../../../components/study/MobileStudyProgress";

export default function StudyProgressPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-[#07111d] px-6 text-sm text-slate-500">
          正在读取学习进度…
        </main>
      }
    >
      <MobileStudyProgress />
    </Suspense>
  );
}
