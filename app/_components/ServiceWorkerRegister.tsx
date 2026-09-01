"use client";

import { useEffect } from "react";

const REFRESH_APP_SHELL_MESSAGE = "REFRESH_APP_SHELL";

async function registerAndRefreshServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", {
    updateViaCache: "none",
  });

  try {
    await registration.update();
  } catch {
    // Keep the current worker if an update check cannot complete.
  }

  try {
    const readyRegistration = await navigator.serviceWorker.ready;
    readyRegistration.active?.postMessage({ type: REFRESH_APP_SHELL_MESSAGE });
  } catch {
    // Startup shell warming is opportunistic and must not block the app.
  }
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const devEnabled = process.env.NEXT_PUBLIC_PWA_DEV === "1";
    if (process.env.NODE_ENV !== "production" && !devEnabled) return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      void registerAndRefreshServiceWorker().catch(() => {
        // Service worker setup must never block normal app startup.
      });
    };

    if (document.readyState === "complete") {
      onLoad();
      return;
    }

    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
