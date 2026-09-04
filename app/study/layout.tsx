import type { ReactNode } from "react";

import { OfflineNavigationGuard } from "../../components/study/OfflineNavigationGuard";
import { StudyOpportunityBoundary } from "../../components/study/StudyOpportunityBoundary";

export default function StudyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <OfflineNavigationGuard />
      <StudyOpportunityBoundary />
      {children}
    </>
  );
}
