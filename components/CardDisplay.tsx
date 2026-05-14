"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { importApkg } from "../lib/apkg";
import { getApkgFile } from "../lib/apkgStorage";
import {
  localMediaCandidatesFromSrc,
  preprocessHtmlForLocalImages,
  sanitize,
  shouldHideFieldLabel,
  splitBySoundTag,
} from "../lib/cardUtils";
import { downloadMediaBlobFromCloud } from "../lib/mediaUtils";
import { getMediaBlob, saveMediaItems } from "../lib/mediaStorage";
import { SoundButton } from "./SoundButton";

export function HtmlWithMedia({
  namespace,
  html,
}: {
  namespace: string;
  html: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const revokeAll = () => {
      for (const url of objectUrlsRef.current) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      objectUrlsRef.current = [];
    };

    revokeAll();
    const root = ref.current;
    if (!root) {
      return () => {
        cancelled = true;
        revokeAll();
      };
    }

    // Important: set innerHTML imperatively so React won't overwrite any
    // attribute changes we apply (like swapping img src to blob: URLs).
    root.innerHTML = html;

    const imgs = Array.from(root.querySelectorAll("img"));
    if (imgs.length === 0) {
      return () => {
        cancelled = true;
        revokeAll();
      };
    }

    void (async () => {
      let resolvedCount = 0;
      let missingCount = 0;

      let attemptedRepair = false;
      let attemptedCloud = false;

      const ensureMediaFromCloud = async (name: string): Promise<Blob | null> => {
        if (attemptedCloud) {
          // Still allow multiple names, but avoid hammering if user is offline.
        }

        const blob = await downloadMediaBlobFromCloud(namespace, name);
        attemptedCloud = true;
        if (!blob) return null;

        try {
          await saveMediaItems(namespace, [{ name, blob }]);
          return blob;
        } catch {
          return null;
        }
      };

      const ensureMediaFromCachedApkg = async (): Promise<boolean> => {
        if (attemptedRepair) return false;
        attemptedRepair = true;

        const stored = await getApkgFile(namespace).catch(() => null);
        if (!stored) return false;

        const file = new File([stored.blob], stored.filename || "deck.apkg", {
          type: "application/octet-stream",
        });

        try {
          await importApkg(file, { mediaNamespace: namespace });
          return true;
        } catch {
          return false;
        }
      };

      for (const img of imgs) {
        if (cancelled) return;

        const rawSrc =
          img.getAttribute("data-caliche-src") ??
          img.getAttribute("data-caliche-orig-src") ??
          img.getAttribute("src") ??
          "";
        const candidates = localMediaCandidatesFromSrc(rawSrc);
        if (candidates.length === 0) continue;

        let blob: Blob | null = null;
        let resolved: string | null = null;
        for (const cand of candidates) {
          blob = await getMediaBlob(namespace, cand);
          if (blob) {
            resolved = cand;
            break;
          }
        }
        if (!blob) {
          // Try cloud first so media works cross-device.
          for (const cand of candidates) {
            const cloudBlob = await ensureMediaFromCloud(cand);
            if (cloudBlob) {
              blob = cloudBlob;
              resolved = cand;
              break;
            }
          }

          const repaired = await ensureMediaFromCachedApkg();
          if (repaired) {
            for (const cand of candidates) {
              blob = await getMediaBlob(namespace, cand);
              if (blob) {
                resolved = cand;
                break;
              }
            }
          }

          if (blob) {
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.push(url);

            if (cancelled) {
              try {
                URL.revokeObjectURL(url);
              } catch {
                // ignore
              }
              continue;
            }

            img.setAttribute("src", url);
            if (resolved) img.setAttribute("data-caliche-media", resolved);
            img.removeAttribute("data-caliche-missing");
            resolvedCount += 1;
            continue;
          }

          missingCount += 1;
          img.setAttribute("data-caliche-missing", "1");
          continue;
        }

        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);

        if (cancelled) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
          continue;
        }

        img.setAttribute("src", url);
        if (resolved) img.setAttribute("data-caliche-media", resolved);
        img.removeAttribute("data-caliche-missing");
        resolvedCount += 1;
      }

      if (process.env.NODE_ENV !== "production") {
        if (resolvedCount > 0 || missingCount > 0) {
          console.info(
            "[media] images resolved=",
            resolvedCount,
            "missing=",
            missingCount,
            "namespace=",
            namespace
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      revokeAll();
    };
  }, [namespace, html]);

  return <div ref={ref} />;
}

export function CardFace({
  namespace,
  html,
  className,
  suppressFirstSoundFilename,
  soundDisabled,
}: {
  namespace: string;
  html: string;
  className?: string;
  suppressFirstSoundFilename?: string | null;
  soundDisabled?: boolean;
}) {
  const parts = useMemo(() => {
    const base = splitBySoundTag(String(html ?? "")).map((p) => {
      if (p.type === "html") {
        const safe = sanitize(p.value);
        return { ...p, value: preprocessHtmlForLocalImages(safe) };
      }
      return p;
    });

    if (!suppressFirstSoundFilename) return base;
    let removed = false;
    return base.filter((p) => {
      if (
        !removed &&
        p.type === "sound" &&
        p.filename === suppressFirstSoundFilename
      ) {
        removed = true;
        return false;
      }
      return true;
    });
  }, [html, suppressFirstSoundFilename]);

  return (
    <div
      className={`text-foreground [&_a]:underline [&_a:hover]:opacity-80 [&_br]:block [&_img]:block [&_img]:mx-auto [&_img]:max-w-full [&_img]:h-auto [&_img]:max-h-[45vh] sm:[&_img]:max-h-[60vh] [&_img]:object-contain [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ${className ?? "text-base leading-7"}`}
    >
      {parts.map((p, idx) => {
        if (p.type === "sound") {
          return (
            <div key={`sound-${idx}-${p.filename}`} className="my-2">
              <SoundButton
                namespace={namespace}
                filename={p.filename}
                disabled={Boolean(soundDisabled)}
              />
            </div>
          );
        }

        return (
          <HtmlWithMedia
            key={`html-${idx}`}
            namespace={namespace}
            html={p.value}
          />
        );
      })}
    </div>
  );
}

export function FieldsList({
  namespace,
  fields,
  names,
  defaultOpen,
  hiddenNorm,
}: {
  namespace: string;
  fields: string[] | undefined;
  names: string[] | undefined;
  defaultOpen?: boolean;
  hiddenNorm?: Set<string>;
}) {
  const [isOpen, setIsOpen] = useState(() => Boolean(defaultOpen));

  const list = (fields ?? []).map((v) => String(v ?? ""));
  const labelList = (names ?? []).map((n) => String(n ?? "").trim());

  const nonEmpty = list
    .map((value, index) => ({
      index,
      value: value.trim(),
      label: labelList[index] || `Field ${index + 1}`,
    }))
    .filter((x) => x.value !== "")
    .filter((x) => !shouldHideFieldLabel(x.label, hiddenNorm));

  if (nonEmpty.length === 0) return null;

  return (
    <div className="rounded-2xl border border-foreground/15 p-4">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 text-left text-xs font-medium text-foreground/70"
      >
        <span>Card info</span>
        <span className="flex items-center gap-2 text-[11px] font-medium text-foreground/60">
          <span>{isOpen ? "Hide" : "Show"}</span>
          <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 flex flex-col gap-3">
          {nonEmpty.map(({ index, value, label }) => (
            <div key={index} className="rounded-xl border border-foreground/10 p-3">
              {label ? (
                <div className="mb-1 text-[11px] font-medium text-foreground/60">
                  {label}
                </div>
              ) : null}
              <CardFace namespace={namespace} html={value} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
