export const CORE_OFFLINE_ROUTES = [
  "/study",
  "/study/review",
  "/study/progress",
  "/study/settings",
  "/study/diagnostics",
] as const;

export type OfflineRouteStatus = {
  path: string;
  cached: boolean;
};

export type PwaDiagnostics = {
  serviceWorkerSupported: boolean;
  controlledByServiceWorker: boolean;
  registrationState: string | null;
  cacheApiSupported: boolean;
  offlineRoutes: OfflineRouteStatus[];
};

function getRegistrationState(
  registration: ServiceWorkerRegistration | undefined
): string | null {
  return (
    registration?.active?.state ??
    registration?.waiting?.state ??
    registration?.installing?.state ??
    null
  );
}

export async function readPwaDiagnostics(): Promise<PwaDiagnostics> {
  const serviceWorkerSupported = "serviceWorker" in navigator;
  let registrationState: string | null = null;

  if (serviceWorkerSupported) {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      registrationState = getRegistrationState(registration);
    } catch {
      registrationState = null;
    }
  }

  const cacheApiSupported = "caches" in globalThis;
  const offlineRoutes: OfflineRouteStatus[] = [];

  for (const path of CORE_OFFLINE_ROUTES) {
    let cached = false;
    if (cacheApiSupported) {
      try {
        cached = Boolean(await caches.match(path));
      } catch {
        cached = false;
      }
    }
    offlineRoutes.push({ path, cached });
  }

  return {
    serviceWorkerSupported,
    controlledByServiceWorker:
      serviceWorkerSupported && Boolean(navigator.serviceWorker.controller),
    registrationState,
    cacheApiSupported,
    offlineRoutes,
  };
}
