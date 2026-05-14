"use client";

export function AppHeader({
  authUser,
  devPurgeEnabled,
  syncBusy,
  syncProgress,
  busy,
  hasLibraries,
  onSync,
  onLogout,
  onClearSaved,
  onDevDebugLocal,
  onDevDebugCloud,
  onDevResetCloud,
  onDevPurgeOthers,
}: {
  authUser: { username: string } | null | undefined;
  devPurgeEnabled: boolean;
  syncBusy: boolean;
  syncProgress: { done: number; total: number; phase: string } | null;
  busy: boolean;
  hasLibraries: boolean;
  onSync: () => void;
  onLogout: () => void;
  onClearSaved: () => void;
  onDevDebugLocal: () => void;
  onDevDebugCloud: () => void;
  onDevResetCloud: () => void;
  onDevPurgeOthers: () => void;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="caliche-title text-3xl tracking-tight sm:text-4xl">
          Caliche Cards
        </h1>
        <p className="caliche-subtitle text-sm">
          Import an Anki .apkg and review with Fail/Pass.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {authUser ? (
          <>
            <div className="caliche-secondary-btn rounded-full px-3 py-2 text-xs text-foreground/70">
              Signed in as {authUser.username}
            </div>

            {devPurgeEnabled ? (
              <>
                <button
                  type="button"
                  className="rounded-full border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/5"
                  onClick={onDevDebugLocal}
                  disabled={busy}
                  title="DEV: show local progress counts"
                >
                  Debug local
                </button>
                <button
                  type="button"
                  className="rounded-full border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/5"
                  onClick={onDevDebugCloud}
                  disabled={busy}
                  title="DEV: show cloud progress counts"
                >
                  Debug cloud
                </button>
                <button
                  type="button"
                  className="rounded-full border border-foreground/15 px-4 py-2 text-sm hover:bg-red-500/5 hover:border-red-500 hover:text-red-500"
                  onClick={onDevResetCloud}
                  disabled={busy || syncBusy}
                  title="DEV: delete ALL my cloud data (libraries, progress, media)"
                >
                  Reset my cloud
                </button>
                <button
                  type="button"
                  className="rounded-full border border-foreground/15 px-4 py-2 text-sm hover:bg-red-500/5 hover:border-red-500 hover:text-red-500"
                  onClick={onDevPurgeOthers}
                  disabled={busy || syncBusy}
                  title="DEV: delete cloud data for all OTHER users"
                >
                  Purge others
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="caliche-secondary-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
              onClick={onSync}
              disabled={syncBusy || busy}
              title={syncProgress?.phase ?? "Sync decks and progress with the cloud"}
            >
              {syncBusy ? (syncProgress?.phase ?? "Syncing…") : "Sync"}
            </button>

            <button
              type="button"
              className="caliche-secondary-btn rounded-full px-4 py-2 text-sm hover:bg-red-500/5 hover:border-red-500 hover:text-red-500"
              onClick={onLogout}
            >
              Logout
            </button>
          </>
        ) : authUser === null ? (
          <button
            type="button"
            className="caliche-secondary-btn rounded-full px-4 py-2 text-sm"
            onClick={() => { window.location.href = "/login"; }}
          >
            Log in
          </button>
        ) : (
          <div className="caliche-secondary-btn rounded-full px-3 py-2 text-xs text-foreground/70">
            Checking session…
          </div>
        )}

        {hasLibraries ? (
          <button
            type="button"
            className="caliche-secondary-btn rounded-full px-4 py-2 text-sm text-foreground/70 hover:text-foreground"
            onClick={onClearSaved}
          >
            Clear all
          </button>
        ) : null}
      </div>
    </header>
  );
}
