"use client";

import Link, { type LinkProps } from "next/link";
import type { MouseEvent, ReactNode } from "react";

type OfflineSafeLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

function hrefToString(href: LinkProps["href"]): string {
  if (typeof href === "string") return href;
  const pathname = href.pathname ?? "";
  const search = new URLSearchParams();

  if (href.query) {
    for (const [key, value] of Object.entries(href.query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) search.append(key, String(item));
      } else {
        search.set(key, String(value));
      }
    }
  }

  const query = search.toString();
  return `${pathname}${query ? `?${query}` : ""}${href.hash ?? ""}`;
}

export function OfflineSafeLink({
  children,
  onClick,
  href,
  ...props
}: OfflineSafeLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      event.preventDefault();
      window.location.assign(hrefToString(href));
    }
  };

  return (
    <Link href={href} prefetch={false} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
