"use client";

import { useState } from "react";
import { FaPlay } from "react-icons/fa";

import { tryPlayAudioFilename } from "../lib/mediaUtils";

export function SoundButton({
  namespace,
  filename,
  variant = "pill",
  disabled = false,
}: {
  namespace: string;
  filename: string;
  variant?: "pill" | "icon";
  disabled?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePlay() {
    setError(null);
    setIsLoading(true);
    try {
      await tryPlayAudioFilename(namespace, filename);
    } catch (e) {
      if (e instanceof Error && e.message === "blob not found") {
        setError("Audio not found");
      } else {
        setError("Couldn't play audio");
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (variant === "icon") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePlay}
          disabled={isLoading || disabled}
          title={filename}
          aria-label="Play"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
        >
          <FaPlay className="h-4 w-4" aria-hidden="true" />
        </button>
        {error ? <span className="text-xs text-red-400">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={handlePlay}
        disabled={isLoading || disabled}
        title={filename}
        className="inline-flex items-center gap-2 rounded-full border border-foreground/15 px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
      >
        <FaPlay className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{isLoading ? "Loading…" : "Play"}</span>
      </button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}
