"use client";

export function CountersInfoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">What do the counters mean?</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-foreground/50 hover:bg-foreground/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-3 text-sm">
          <li>
            <span className="font-medium">Due</span>
            <span className="ml-1 text-foreground/60">— Cards you can answer right now. Includes learning, review, and new cards up to your daily limits.</span>
          </li>
          <li>
            <span className="font-medium">New</span>
            <span className="ml-1 text-foreground/60">— Cards you have never seen before, shown up to your New/day limit.</span>
          </li>
          <li>
            <span className="font-medium">Learning</span>
            <span className="ml-1 text-foreground/60">— Cards in active learning: cards you are seeing for the first time today, plus cards you failed and are relearning. These repeat on short intervals until they graduate.</span>
          </li>
          <li>
            <span className="font-medium">Review</span>
            <span className="ml-1 text-foreground/60">— Cards you already know, returning today based on the spaced-repetition schedule. Shown up to your Review/day limit.</span>
          </li>
          <li>
            <span className="font-medium">Waiting</span>
            <span className="ml-1 text-foreground/60">— Learning cards on a short timer (e.g. 10 min). They are not available yet but will appear automatically when their time is up.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
