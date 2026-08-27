export type StorageDiagnostics = {
  secureContext: boolean;
  storageApiSupported: boolean;
  persistRequestSupported: boolean;
  persistent: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
  standalone: boolean;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function isStandaloneDisplayMode(): boolean {
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as NavigatorWithStandalone).standalone === true;
  return mediaStandalone || iosStandalone;
}

export async function readStorageDiagnostics(): Promise<StorageDiagnostics> {
  const storage = navigator.storage;
  const storageApiSupported = Boolean(storage);
  const persistRequestSupported =
    storageApiSupported && typeof storage.persist === "function";

  let persistent: boolean | null = null;
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;

  if (storageApiSupported && typeof storage.persisted === "function") {
    try {
      persistent = await storage.persisted();
    } catch {
      persistent = null;
    }
  }

  if (storageApiSupported && typeof storage.estimate === "function") {
    try {
      const estimate = await storage.estimate();
      usageBytes =
        typeof estimate.usage === "number" && Number.isFinite(estimate.usage)
          ? estimate.usage
          : null;
      quotaBytes =
        typeof estimate.quota === "number" && Number.isFinite(estimate.quota)
          ? estimate.quota
          : null;
    } catch {
      usageBytes = null;
      quotaBytes = null;
    }
  }

  return {
    secureContext: window.isSecureContext,
    storageApiSupported,
    persistRequestSupported,
    persistent,
    usageBytes,
    quotaBytes,
    standalone: isStandaloneDisplayMode(),
  };
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = navigator.storage;
  if (!storage || typeof storage.persist !== "function") return null;

  try {
    return await storage.persist();
  } catch {
    return null;
  }
}
