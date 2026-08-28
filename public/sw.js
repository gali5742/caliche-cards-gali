// Bump this when changing caching behavior to ensure old caches are dropped.
const CACHE_NAME = "language-study-v10";

const PRECACHE_URLS = [
  "/",
  "/study",
  "/study/review",
  "/study/progress",
  "/study/vocabulary",
  "/study/settings",
  "/study/data",
  "/study/diagnostics",
  "/manifest.webmanifest",
  "/sql-wasm.wasm",
  "/icon",
  "/apple-icon",
];

function shellFallbackPath(pathname) {
  if (pathname.startsWith("/study/diagnostics")) return "/study/diagnostics";
  if (pathname.startsWith("/study/data")) return "/study/data";
  if (pathname.startsWith("/study/settings")) return "/study/settings";
  if (pathname.startsWith("/study/vocabulary")) return "/study/vocabulary";
  if (pathname.startsWith("/study/progress")) return "/study/progress";
  if (pathname.startsWith("/study/review")) return "/study/review";
  return pathname.startsWith("/study") ? "/study" : "/";
}

async function precacheIndividually(cache) {
  await Promise.allSettled(
    PRECACHE_URLS.map(async (url) => {
      const request = new Request(url, { cache: "reload" });
      const response = await fetch(request);

      if (!response.ok || response.redirected) {
        throw new Error(`Unable to precache ${url}`);
      }

      await cache.put(request, response);
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await precacheIndividually(cache);
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
