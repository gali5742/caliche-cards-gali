# Phase 4 PWA survival diagnostics

This phase adds an in-app diagnostic surface for real iPhone/Home Screen Web App validation.

## Route

`/study/diagnostics`

The screen is reachable from `/study/settings` and is part of the service-worker precache.

## Checks

### Storage

- secure-context status
- standalone/Home Screen display mode
- Storage API availability
- current persistent-storage status
- persistent-storage request support
- estimated origin usage and quota

A persistence request is only made after an explicit user action. A failed or denied request is reported; it does not block study.

### PWA shell

- Service Worker support
- whether the current page is controlled by the Service Worker
- registration state
- Cache API support
- cached availability of:
  - `/study`
  - `/study/review`
  - `/study/settings`
  - `/study/diagnostics`

### Native study data

The diagnostic reads counts only; it does not upload or mutate study content:

- ReviewItems
- ReviewStates
- ReviewEvents
- learning-progress rows
- settings rows

## Recommended iPhone validation

1. Open the site in Safari and add it to the Home Screen.
2. Launch it from the Home Screen.
3. Open Settings -> Device and offline diagnostics.
4. Confirm standalone mode and request persistent storage.
5. Complete several reviews and verify local event/state counts increase.
6. Enable Airplane Mode, fully close the Web App, and reopen it.
7. Verify Home, Review, Settings, and Diagnostics remain navigable.
8. Restore connectivity and verify the same IndexedDB study state remains available.

## Boundaries

Persistent storage reduces eviction risk but is not a backup strategy. Export/restore remains a separate required feature before relying on the app for long-lived study history.
