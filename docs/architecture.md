# Desktop client architecture

## High level

- **Main process** (`src/main.js`) owns windows, menus, tray, global shortcuts, SSE, polling, and IPC handlers registered via `src/ipc.js`.
- **Preload** (`src/preload.js`) exposes a whitelisted `window.ahdClient` API to the **game web app** (remote Next.js UI loaded in `BrowserWindow`).
- **Session** — The main window and pop-out windows use Electron session partition **`persist:ahd`**. Cookies set by the game origin are shared so login state matches across windows.
- **Game origin** — Resolved at runtime through `src/active-game-url.js` (production, sandbox, dev server, or `AHD_GAME_URL` override).

## Key modules

| Area                     | Files                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| App menu, Navigate, View | `menu.js`, `nav.js`, `countries.js`, `urls.js`                                             |
| Client manifest          | `site-api.js` (`GET /api/client-nav`, `/api/countries`), `nav-manifest.js` (normalization) |
| Corporation enrichment   | `corporation-enrich.js` (pathId, ceoId, strip/merge)                                       |
| Game menu quick links    | `game-panel-links.js`, `game-panel-config.html`, `game-panel-config-window.js`             |
| PiP / mini mode          | `pip.js`, `pip.html`, `pip-view-poller.js`, `dashboard.js`                                 |
| Tray & notifications     | `tray.js`, `notifications.js`                                                              |
| Pop-out presets          | `windows.js`                                                                               |
| Global shortcuts         | `shortcuts.js` (defaults + `customShortcuts` preference)                                   |
| Theme / cache / queue    | `cache.js`, `action-queue.js`, `sse.js`                                                    |

## Client-nav pipeline

1. After each full load (`did-finish-load`), on first SSE connect, and on a focus-aware interval (30s focused / 60s unfocused), the main process calls `GET /api/client-nav` with the same cookies as the game window.
2. The JSON response is normalized in `nav-manifest.js` (e.g. `character_countryId` → `characterCountryId`, derived `hasCharacter` when the API omits the flag but sends character-related fields).
3. Optionally enriched from `GET /api/character/me` for corporation / CEO fields (`enrichClientNavManifest` in `main.js`).
4. Effects: IPC to renderer (`client-nav`, `nav-data-updated`, `auth-state`, unread counts), **MenuManager.setNavConfig**, window preset updates, and game-state hydration for tray/PiP.

If the first fetch returns `null` (timing, parse error), `pullClientNav({ retryOnNull: true })` retries with backoff so the **Navigate** menu is not stuck until the next poll. Both `focus` and `show` events on the main window also trigger a `pullClientNav` so the menu refreshes on window restore as well as focus gain. Navigating to `/corporation` or `/stockmarket` paths triggers an automatic re-sync.

## Preload surface (`window.ahdClient`)

The game page may invoke only channels listed in `preload.js` (`INVOKE_CHANNELS`) and listen on `RECEIVE_CHANNELS`. Common uses:

- Navigation: `go-home`, `go-back`, `go-forward`, `navigate-to`, `open-external`
- Shell state: `fetch-nav-data`, `get-game-state`, `set-theme`, `toggle-pip`, `open-window` (pop-out presets)
- Account: `switch-character`, `sign-out`

## Game panel configuration window

A separate small `BrowserWindow` loads `game-panel-config.html` with **`game-panel-config-preload.js`**, which exposes `window.gamePanelConfig` (not `ahdClient`). It talks to main via IPC: game menu entries, PiP status bar stats, and keyboard shortcut overrides (`get-custom-shortcuts` / `save-shortcuts`).

## Dynamic countries

After each SSE connect (and on startup from cache), the main process calls `GET /api/countries` via `site-api.fetchCountries()`. The response is stored in `cache.js` (`countries` key) and set on `countries.js` via `setCountriesCache()`. All subsequent `getCountryConfig()` calls prefer the server list; hardcoded defaults in `COUNTRIES` serve only as offline fallback. If the list changes (different length or ids), the menu is rebuilt immediately.

## Corporation enrichment (`corporation-enrich.js`)

`enrichClientNavManifest` in `main.js` delegates to `mergeCharacterMeIntoManifest()` after fetching `/api/character/me`. The module:

- Extracts `pathId` (preferred), `sequentialId`, `sequential_id`, `_id`, or `id` as the URL segment via `corporationPathIdForUrl()`.
- Detects CEO status by matching `character._id` against `corp.ceoId`, or checking `isCeo` / `role` fields.
- Calls `stripCorporationEnrichment()` on catch or when `hasCharacter` is false, so stale corporation data is cleared on 401 / logout / leaving a corporation.

All corporation URL construction (`menu.js`, `game-panel-links.js`, `pip.html`) wraps the id segment in `encodeURIComponent` for slug safety.

## SSE fallback polling

When SSE disconnects (common with Vercel multi-instance), `main.js` starts a 30-second `setInterval` that calls `fetchClientNav()` and pipes the result through `handleClientNav()`. The timer is cleared on SSE reconnect and on app cleanup.

## Version header

All authenticated `net.request()` calls (`site-api.js`) send `X-AHD-Client-Version: <package.json version>` so the server can detect outdated clients.

## Failure and recovery behavior

- **API reads** resolve to `null` on transport, HTTP, size-limit, or JSON errors. Callers treat this as unavailable data and retain their last known state where appropriate.
- **SSE** emits connection status and retries transient failures with exponential backoff. A missing endpoint (404/410) does not retry forever; the main process enables fallback client-nav polling instead.
- **Offline actions** are persisted by `CacheManager`, replayed by the renderer after reconnect, and removed only after a successful result. Failed actions are retried up to the queue limit and then surfaced to the user.
- **Navigation failures** are handled by overlays rather than exposing raw server error pages. New loads dismiss the overlay so recovery remains possible.

## Change checklist

Before submitting a change that touches the shell boundary:

1. Keep remote pages on trusted origins and preserve `contextIsolation`, `sandbox`, and disabled Node integration.
2. Add a preload channel only when an existing channel cannot express the feature; validate arguments again in the main process.
3. Make timers and listeners part of the owning module's cleanup path.
4. Preserve the persistent `persist:ahd` session when a feature needs login state.
5. Run `npm run lint`, `npm run format:check`, and the relevant Jest or Playwright tests.
6. Update this guide when ownership, data flow, or recovery behavior changes.

## Builds

`electron-builder` targets: **Windows** NSIS (`.exe`), **macOS** DMG, **Linux** AppImage. CI builds are **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY=false`); see the main README for macOS Gatekeeper notes.
