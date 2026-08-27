// Bump this when changing caching behavior to ensure old caches are dropped.
const CACHE_NAME = "language-study-v1";

const PRECACHE_URLS = [
  "/",
  "/study",
  "/manifest.webmanifest",
  "/sql-wasm.wasm",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/icon",
  "/apple-icon",
];

function shellFallbackPath(pathname) {
  return pathname.startsWith("/study") ? "/study" : "/";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(PRECACHE_URLS);
      } catch {
        // If precache fails (redirects, transient network), still install.
      }
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

  if (
    url.pathname === "/favicon.ico" ||
    url.pathname === "/favicon-16x16.png" ||
    url.pathname === "/favicon-32x32.png" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/apple-touch-icon-precomposed.png" ||
    url.pathname === "/logo.ico" ||
    url.pathname === "/logo.png" ||
    url.pathname === "/logo-180.png" ||
    url.pathname === "/logo-192.png" ||
    url.pathname === "/logo-512.png"
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }

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
