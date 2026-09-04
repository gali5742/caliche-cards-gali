"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  getStudyOpportunityStartedAt,
  markStudyOpportunityHidden,
  resumeStudyOpportunity,
} from "../../lib/study/studyOpportunity";

export function StudyOpportunityBoundary() {
  const pathname = usePathname();

  useEffect(() => {
    getStudyOpportunityStartedAt(Date.now());

    const markHidden = () => {
      markStudyOpportunityHidden(Date.now());
    };

    const resume = () => {
      const result = resumeStudyOpportunity(Date.now());
      if (result.startedNew && pathname === "/study") {
        window.location.reload();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markHidden();
      } else if (document.visibilityState === "visible") {
        resume();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", markHidden);
    window.addEventListener("pageshow", resume);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", markHidden);
      window.removeEventListener("pageshow", resume);
    };
  }, [pathname]);

  return null;
}
