# Desktop client architecture

## High level

- **Main process** (`src/main.js`) owns windows, menus, tray, global shortcuts, SSE, polling, and IPC handlers registered via `src/ipc.js`.
- **Preload** (`src/preload.js`) exposes a whitelisted `window.ahdClient` API to the **game web app** (remote Next.js UI loaded in `BrowserWindow`).
- **Session** — The main window and pop-out windows use Electron session partition **`persist:ahd`**. Cookies set by the game origin are shared so login state matches across windows.
- **Game origin** — Resolved at runtime through `src/active-game-url.js` (production, sandbox, dev server, or `AHD_GAME_URL` override).

## Key modules

| Area                     | Files                                                                          |
| ------------------------ | ------------------------------------------------------------------------------ |
| App menu, Navigate, View | `menu.js`, `nav.js`, `countries.js`, `urls.js`                                 |
| Client manifest          | `site-api.js` (`GET /api/client-nav`), `nav-manifest.js` (normalization)       |
| Game menu quick links    | `game-panel-links.js`, `game-panel-config.html`, `game-panel-config-window.js` |
| PiP / mini mode          | `pip.js`, `pip.html`, `pip-view-poller.js`, `dashboard.js`                     |
| Tray & notifications     | `tray.js`, `notifications.js`                                                  |
| Pop-out presets          | `windows.js`                                                                   |
| Global shortcuts         | `shortcuts.js` (defaults + `customShortcuts` preference)                       |
| Theme / cache / queue    | `cache.js`, `action-queue.js`, `sse.js`                                        |

## Client-nav pipeline

1. After each full load (`did-finish-load`), on first SSE connect, and on a focus-aware interval (30s focused / 60s unfocused), the main process calls `GET /api/client-nav` with the same cookies as the game window.
2. The JSON response is normalized in `nav-manifest.js` (e.g. `character_countryId` → `characterCountryId`, derived `hasCharacter` when the API omits the flag but sends character-related fields).
3. Optionally enriched from `GET /api/character/me` for corporation / CEO fields (`enrichClientNavManifest` in `main.js`).
4. Effects: IPC to renderer (`client-nav`, `nav-data-updated`, `auth-state`, unread counts), **MenuManager.setNavConfig**, window preset updates, and game-state hydration for tray/PiP.

If the first fetch returns `null` (timing, parse error), `pullClientNav({ retryOnNull: true })` retries with backoff so the **Navigate** menu is not stuck until the next poll.

## Preload surface (`window.ahdClient`)

The game page may invoke only channels listed in `preload.js` (`INVOKE_CHANNELS`) and listen on `RECEIVE_CHANNELS`. Common uses:

- Navigation: `go-home`, `go-back`, `go-forward`, `navigate-to`, `open-external`
- Shell state: `fetch-nav-data`, `get-game-state`, `set-theme`, `toggle-pip`, `open-window` (pop-out presets)
- Account: `switch-character`, `sign-out`

## Game panel configuration window

A separate small `BrowserWindow` loads `game-panel-config.html` with **`game-panel-config-preload.js`**, which exposes `window.gamePanelConfig` (not `ahdClient`). It talks to main via IPC: game menu entries, PiP status bar stats, and keyboard shortcut overrides (`get-custom-shortcuts` / `save-shortcuts`).

## Builds

`electron-builder` targets: **Windows** NSIS (`.exe`), **macOS** DMG, **Linux** AppImage. CI builds are **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY=false`); see the main README for macOS Gatekeeper notes.
