// Bump this when changing caching behavior to ensure old caches are dropped.
const CACHE_NAME = "language-study-v12";
const REFRESH_APP_SHELL_MESSAGE = "REFRESH_APP_SHELL";

const APP_SHELL_ROUTES = [
  "/study",
  "/study/review",
  "/study/progress",
  "/study/vocabulary",
  "/study/settings",
  "/study/data",
  "/study/diagnostics",
];

const STATIC_PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
];

let shellRefreshInFlight = null;

function shellFallbackPath(pathname) {
  if (pathname.startsWith("/study/diagnostics")) return "/study/diagnostics";
  if (pathname.startsWith("/study/data")) return "/study/data";
  if (pathname.startsWith("/study/settings")) return "/study/settings";
  if (pathname.startsWith("/study/vocabulary")) return "/study/vocabulary";
  if (pathname.startsWith("/study/progress")) return "/study/progress";
  if (pathname.startsWith("/study/review")) return "/study/review";
  return "/study";
}

function extractNextStaticAssets(html, baseUrl) {
  const assets = new Set();
  const attributePattern = /(?:src|href)=["']([^"']+)["']/gi;

  for (const match of html.matchAll(attributePattern)) {
    const rawValue = match[1].replaceAll("&amp;", "&");
    try {
      const assetUrl = new URL(rawValue, baseUrl);
      if (
        assetUrl.origin === self.location.origin &&
        assetUrl.pathname.startsWith("/_next/static/")
      ) {
        assets.add(assetUrl.href);
      }
    } catch {
      // Ignore malformed or non-URL attributes.
    }
  }

  return assets;
}

async function fetchFresh(url) {
  const request = new Request(url, { cache: "reload" });
  const response = await fetch(request);

  if (!response.ok || response.redirected) {
    throw new Error(`Unable to refresh ${url}`);
  }

  return { request, response };
}

async function refreshRouteShell(cache, url) {
  const { request, response } = await fetchFresh(url);
  await cache.put(request, response.clone());

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return [];

  const html = await response.text();
  return [...extractNextStaticAssets(html, request.url)];
}

async function refreshCachedAsset(cache, url) {
  const { request, response } = await fetchFresh(url);
  await cache.put(request, response.clone());
}

async function refreshAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const routeResults = await Promise.allSettled(
    APP_SHELL_ROUTES.map((url) => refreshRouteShell(cache, url))
  );

  const nextStaticAssets = new Set();
  for (const result of routeResults) {
    if (result.status !== "fulfilled") continue;
    for (const assetUrl of result.value) {
      nextStaticAssets.add(assetUrl);
    }
  }

  await Promise.allSettled([
    ...STATIC_PRECACHE_URLS.map((url) => refreshCachedAsset(cache, url)),
    ...[...nextStaticAssets].map((url) => refreshCachedAsset(cache, url)),
  ]);
}

function refreshAppShellOnce() {
  if (!shellRefreshInFlight) {
    shellRefreshInFlight = refreshAppShell().finally(() => {
      shellRefreshInFlight = null;
    });
  }
  return shellRefreshInFlight;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await refreshAppShellOnce();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== REFRESH_APP_SHELL_MESSAGE) return;
  event.waitUntil(refreshAppShellOnce());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  // iOS Safari can wait tens of seconds before failing an offline navigation.
  // Use a short timeout, then serve the route-specific cached shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          let response;
          try {
            response = await fetch(request, { signal: controller.signal });
          } finally {
            clearTimeout(timeoutId);
          }

          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const exact = await cache.match(request);
          if (exact) return exact;
          const shell = await cache.match(shellFallbackPath(url.pathname));
          if (shell) return shell;
          return Response.error();
        }
      })()
    );
    return;
  }

  if (url.pathname.startsWith("/_next/image")) return;

  if (url.pathname.startsWith("/_next/static")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.status === 200 && url.origin === self.location.origin) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const fallback = await cache.match(shellFallbackPath(url.pathname));
        if (fallback) return fallback;
        throw err;
      }
    })()
  );
});
