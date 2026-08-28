import type { ReactNode } from "react";

import { OfflineNavigationGuard } from "../../components/study/OfflineNavigationGuard";

export default function StudyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <OfflineNavigationGuard />
      {children}
    </>
  );
}
