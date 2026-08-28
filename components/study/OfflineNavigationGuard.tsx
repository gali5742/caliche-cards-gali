"use client";

import { useEffect } from "react";

export function OfflineNavigationGuard() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (navigator.onLine !== false || event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/study")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      window.location.assign(url.href);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
