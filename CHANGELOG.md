# Changelog

All notable changes to the A House Divided desktop client are documented here.

---

## [1.3.0] - 2026-08-27

### Added

- **Bulk corporation wage controls** — CEOs can set the wage level for every sector at once from Navigate > World > My Corporation > Wages, via presets (0.80x–1.50x) or a custom value. Levels are clamped to `[0.8, 1.5]`, mirroring `WAGE_LEVEL_MIN`/`MAX` in the game's `laborCost.ts`, and the menu is only enabled for the CEO of a corporation (`src/corporation-wages.js`, `src/menu.js`).

  The apply step is paced against the server's real budget of 20 wage writes per minute per user. Sectors are enumerated first so the confirmation states the true count and, for large corporations, the expected duration; a rolling-window pacer then admits at most 20 writes per 60 s, and any 429 that still lands is honoured via `Retry-After` and retried rather than counted as a failure. Progress is reported on the taskbar icon.

  This matters at the tail: production holds 661 corporations averaging 6.8 sectors, but 30 exceed 20 sectors and the largest holds 105. Measured against a mock of the real limiter, a 105-sector apply went from **40 succeeded / 65 rate-limited failures** to **105/105 with no 429s at all**. Corporations at or under 20 sectors are unaffected and still apply instantly.

  `scripts/mock-game-server.js` (`npm run mock`) stubs the endpoints and mirrors the limiter, so the paced path can be exercised locally — `MOCK_SECTORS`, `MOCK_RATE_LIMIT`, and `MOCK_WINDOW_MS` control the shape.

### Fixed

- **Update download failures were completely silent** — `downloadUpdate()` was fire-and-forget: on any network error the promise rejected with no UI, the "Downloading…" taskbar progress vanished, and users were left waiting forever after clicking Download (looked like the app hung). Failures now show an error dialog with the reason and a hint to retry after restarting the app; repeated Download clicks are guarded against re-entry while a download is in flight (`src/updater.js`). Regression tests added.
- **"Restart Now" left the app closed after installing** — `quitAndInstall()` defaults to _not_ relaunching: the installer ran silently and the app simply exited, reading as if the update ate the app. It now passes `isForceRunAfter` so the freshly installed build starts immediately (`src/updater.js`).
- **Raw JSON / certificate-error JSON shown on manual refresh during turn processing** — While the server is busy processing a turn, a refresh could render a bare 5xx body or a raw `application/json` error document as the main frame. Main-frame responses with HTTP ≥ 500 now show the friendly "server is processing" overlay, and any main frame that finishes loading as a JSON document is covered too — including 200-with-JSON-body responses that have no HTTP error code (`src/main.js`, `src/error-handler.js`).
- **Command palette buttons did nothing** — The injected Cmd+K palette invoked the `navigate` IPC channel, which is receive-only in `preload.js` (the invokable channel is `navigate-to`), so pressing Enter or clicking a result silently rejected and the palette appeared broken. Both call sites now use `navigate-to` (`src/main.js`).
- **Reload threw you back to the home page** — Game menu Reload (Ctrl+R) and context-menu Reload loaded the bare game URL instead of reloading the current page, abandoning whatever route the user was on. Both now reload in place via `webContents.reload()` when a game page is open (`src/menu.js`, `src/main.js`).
- **Custom keyboard shortcut overrides never applied** — `ShortcutManager` required the `CacheManager` _class_ at module level and called `getPreference` on it (a non-static method), so saved overrides were always silently ignored. The live instance is now injected via the constructor from `main.js`, and `getEffectiveShortcuts` no longer mutates the shared defaults object (`src/shortcuts.js`). Regression tests added.
- **Intermittently missed turn events** — A single SSE frame is routinely delivered over several TCP chunks, but the parser kept the event type and data accumulator as locals inside `processBuffer()`. A frame whose `event:` line arrived in one chunk and `data:` line in the next lost its type and was emitted as a generic `message`, so every named-type listener silently skipped it: turn caching, the `theme_changed` handler, the immediate post-turn dashboard re-poll, and turn/election desktop notifications. Balances would go quietly stale until the next scheduled poll. Parse state now lives on the instance and resets on connect, disconnect, and buffer overflow (`src/sse.js`). Regression tests added.

### Changed

- **Reasonable balance updates** — Dashboard polling is now adaptive: every 30 s while the app window is focused (funds / AP / countdown feel live without hammering the API), every 60 s in the background. Returning focus to the window triggers an immediate poll plus an instant client-nav hydration so balances are never stale after playing elsewhere. Immediate re-polls after turn/action SSE events are unchanged (`src/dashboard.js`, `src/main.js`). New unit suite `tests/unit/dashboard.test.js`.

## [1.2.2] - 2026-08-25

### Fixed

- **Navigation can no longer crash the main process** — All `webContents.loadURL` calls now go through a `safeLoadURL` helper (`src/safe-load-url.js`) that guards a destroyed window and swallows the promise rejection Electron raises on aborted/failed navigations (e.g. `ERR_ABORTED` when a newer load supersedes one). Menu items, the Sign Out / character-switch flows, and global shortcuts route through it, and menu handlers gained `canNavigate()`/`isDestroyed()` guards so clicking after the window closes is a no-op instead of a crash.
- **TLS/certificate failures get a dedicated overlay** — `did-fail-load` distinguishes certificate errors (`CERT_ERROR_PATTERN`) from generic connection failures and shows a specific recovery message (check your clock, or the site owner must renew the certificate) instead of the generic offline overlay.
- **Dashboard & PiP pollers no longer hang on stalled responses** — The request timeout stays armed for the whole response (headers _and_ body) instead of being cleared once headers arrive, and every resolve/reject path clears the timer through a single helper (`src/dashboard.js`, `src/pip-view-poller.js`).
- **Corrupted non-ASCII API responses** — Response bodies are buffered and decoded as UTF-8 once at the end, so multi-byte characters split across chunk boundaries are no longer mangled (`src/site-api.js`, `src/error-handler.js`).
- **Cookie-store failures no longer crash background polls** — Authenticated GET/POST helpers degrade to "no cookies" instead of rejecting into an unhandled-rejection crash (`src/site-api.js`).
- **Silent shortcut registration failures** — `globalShortcut.register()` returning `false` (OS rejected the accelerator) is now logged instead of passing unnoticed (`src/shortcuts.js`).
- **Feedback capture** — Guards the main window with `isDestroyed()` after the async screenshot/save-dialog steps, and the floating `executeJavaScript` feedback trigger now has explicit error handling (`src/feedback.js`).

---

## [1.2.1] - 2026-08-25

### Fixed

- **SSE 404 no longer crashes the app** — The web app removed the `/api/events` SSE endpoint (replaced by polling), so the client's SSE connection received a permanent 404 on every page navigation. `src/sse.js` emitted a Node `'error'` event with no listener attached, which throws as an uncaught exception in the main process and showed the "A JavaScript error occurred in the main process" crash dialog (error spam after Login with Discord redirects). Errors are now emitted through a safe helper that logs instead of throwing, 404/410 responses are treated as endpoint-gone (the existing 30-second fallback polling engages, no pointless reconnect loop), and `src/main.js` forwards SSE errors to the renderer's connection status. Regression tests in `tests/unit/sse.test.js` reproduce the exact reported 404 scenario (ticket #1182).

---

## [1.2.0] - 2026-06-01

### Added

- **Dynamic countries** — Fetches `/api/countries` on SSE connect and caches the result in `src/cache.js` (new `countries` schema entry) and `src/countries.js`. The client now falls back to hardcoded defaults only when the server is unreachable; country-scoped menu items, paths, and labels update live when the server list changes.
- **SSE fallback polling** — When SSE disconnects (e.g., Vercel multi-instance), the main process starts a 30-second `fetchClientNav` poll loop (`sseFallbackTimer`) so the Navigate menu and tray stay in sync. The timer stops automatically when SSE reconnects.
- **`X-AHD-Client-Version` header** — All `net.request()` calls to the game origin (`site-api.js`) now send `X-AHD-Client-Version: <package.json version>` so the server can detect outdated clients.
- **`corporation-enrich.js`** — Corporation-path logic extracted from `main.js` into a dedicated module. `corporationPathIdForUrl` prefers API `pathId`, falls back to `sequentialId` (including 0), `sequential_id`, `_id`, and `id`. `mergeCharacterMeIntoManifest` and `stripCorporationEnrichment` handle the full `/api/character/me` → manifest merge lifecycle.
- **Corporation path encoding** — `encodeURIComponent` applied to corporation IDs in `menu.js`, `game-panel-links.js`, and `pip.html` so slug-based `pathId` values are safe in URLs.
- **Tests** — New `tests/unit/corporation-enrich.test.js` covering `corporationPathIdForUrl`, `stripCorporationEnrichment`, and `mergeCharacterMeIntoManifest` edge cases.

### Changed

- **Dashboard poll interval** — `DashboardPoller` default poll period increased from 10s to 60s to match the spec for dashboard bar updates.
- **Window focus/show** — Both `focus` and `show` events on the main window now trigger `pullClientNav`, so the Navigate menu refreshes when the window is restored from minimize as well as when it gains focus.
- **Corporation/stockmarket re-sync** — Navigating to `/corporation` or `/stockmarket` paths triggers a `pullClientNav` so corporation menu items and CEO state update after in-app actions.
- **Cache schema** — `cache.js` schema extended with a `countries` entry (type `array`, default `[]`).

### Fixed

- **Corporation enrichment on error** — `enrichClientNavManifest` now calls `stripCorporationEnrichment` on catch, so stale `myCorporationId` / `isCeo` values are cleared when `/api/character/me` fails (401, network error, etc.) instead of persisting old data.
- **Countries cache default** — Cache schema `countries` default is `[]` (array) to prevent `getCountries()` returning `undefined` on first launch.

---

## [1.1.0] - 2026-04-07

### Added

- **GitHub Actions — multi-platform releases** — Pushing a `v*` tag runs tests once on Ubuntu, then builds **Windows** (NSIS `.exe`), **macOS** (`.dmg`), and **Linux** (`.AppImage`) on native runners; all artifacts attach to a single GitHub Release (`.github/workflows/release.yml`).
- **Keyboard shortcuts UI** — **Game menu → Customize Game Panel…** includes a **Keyboard Shortcuts** tab to override global accelerators; stored in `userPreferences.customShortcuts` (`save-shortcuts` / `get-custom-shortcuts` IPC, `shortcuts.js`).
- **Documentation** — Rewrote `README.md` (player features table, npm scripts, project tree, contributing, release badge, MIT license aligned with `package.json`); added `docs/README.md` (index) and `docs/architecture.md` (main modules, client-nav pipeline, preload and game-panel IPC).

### Fixed

- **Navigate menu** — `src/nav-manifest.js` derives `hasCharacter` when `/api/client-nav` omits the flag but still sends `homeState`, `adminCharacters`, nested `character`, or `has_character`, so Profile / State / Nation / World items are not hidden behind only **Pop Out Window**.
- **Navigate menu (timing)** — `pullClientNav({ retryOnNull: true })` in `src/main.js` retries `/api/client-nav` after `did-finish-load` and first SSE connect when the response is `null` (session/cookies briefly behind the page load), instead of waiting for the 30–60s poll.
- **Cmd+K command palette** — `injectCommandPalette` in `src/main.js` reads string `route` values from `getNavForCountry()` objects (`executive`, `legislature`, etc.) instead of passing whole objects into `navigate`.

### Changed

- **Unsigned macOS builds** — `CSC_IDENTITY_AUTO_DISCOVERY=false` for CI and `npm run build:mac`; `package.json` `build.mac` sets `hardenedRuntime: false` and `gatekeeperAssess: false` so DMGs build without Apple signing keys (users may need to right-click → Open the first time).

---

## [1.0.3] - 2026-04-06

### Added

- **Game menu — customizable quick links** — The Game menu opens with shortcuts (Profile, Campaign HQ, Notifications, Portfolio, corporation). **Customize Game Panel…** opens a small window to enable or disable built-in links and add custom paths; the layout is stored in `userPreferences.gamePanelEntries`.
- **CEO / Create a corporation** — The corporation shortcut is included by default. Labels: **CEO** → `/corporation/{id}/ceo`; **My corporation** → `/corporation/{id}` when the character has a corporation but is not CEO; **Create a corporation** → `/corporation/new` when none. Client-nav enrichment merges `isCeo` and `myCorporationId` from `/api/character/me` (supports alternate field shapes and 2xx-only JSON parsing for that request).
- **IPC** — `get-game-panel-config`, `set-game-panel-entries`, and `reset-game-panel-entries` support the config window (`game-panel-config.html` + preload).
- **Active game URL** — `src/active-game-url.js` resolves the current game origin; works with environment-driven config and dev/sandbox toggles (`src/game-server-dev.js`).
- **PiP / turn dashboard** — Richer floating dashboard (multi-view Standard / Corp / Elections / Global, customizable bar and custom panel layout, AP and stat strip).
- **PiP view data** — `pip-view-poller.js` polls `/api/pip/standard`, `/api/pip/corp`, `/api/pip/elections`, and `/api/pip/global` on a 60s interval (with immediate refresh on view change) to hydrate each view and custom-panel bundles.
- **PiP labels** — `pip-labels.js` maps party slugs, election and corporation types, and related display strings for the PiP window.
- **Compact currency in PiP** — Dollar amounts use suffix-style formatting (e.g. `$130.19k`, `$140m`) via `format-compact-number.js` instead of locale thousands grouping.

### Changed

- **Main process URL loading** — Components that previously used a fixed `config.GAME_URL` now use `activeGameUrl.get()` where appropriate so dev, sandbox, and production origins stay consistent (menus, tray, shortcuts, windows, SSE, dashboard, devtools, error handler, etc.).

### Tests

- Unit coverage for `game-panel-links`, `active-game-url`, `game-server-dev`, `format-compact-number`, and `pip-labels`.

---

## [1.0.2] - 2026-04-04

### Added

- **Game server selection (View menu)** — **Use sandbox / test server (Supporter+)** points at `https://test.ahousedividedgame.com` by default (`AHD_SANDBOX_GAME_URL` overrides). With **`npm run dev`** (`NODE_ENV=development`), **Use local dev server (localhost:3000)** loads `http://localhost:3000` (`AHD_DEV_GAME_URL` overrides); it is mutually exclusive with the test-server toggle. Preferences: `useSandboxServer`, `useDevServer`.
- **Focused view & website navbar parity (main process)** — country config and URL helpers (`src/countries.js`, `src/urls.js`) align executive, legislature, budget, metrics, and related paths with the web app (e.g. `/white-house`, `/congress`, `/national-metrics?country=`).
- **`src/site-api.js`** — shared authenticated GET/POST against the game origin (`fetchClientNav`, `fetchCharacterMe`, `postJsonAuthed`) using the `persist:ahd` session.
- **`src/nav-manifest.js`** — normalizes `character_countryId` vs `characterCountryId` from `/api/client-nav` for a single internal shape.
- **Client-nav enrichment** — after each manifest, optionally merges `myCorporationId` from `/api/character/me` when `corporation.sequentialId` is present (World → My Corporation in the site UI).
- **IPC for in-page / Electron navbar** — `fetch-nav-data`, `navigate-to`, `open-external`, `switch-character`, `sign-out`; preload whitelist extended with `nav-data-updated`, `toggle-focused-view`, and `navigate` (receive).
- **`nav-data-updated` event** — same payload as `client-nav`, for renderers that follow the newer channel name.
- **Tray** — `setFocusedViewToggleHandler` adds a **Toggle Focused View** item; mirrors View → Focused Mode.
- **Global shortcut** — `CmdOrCtrl+Shift+F` toggles focused vs classic display mode (cookie `ahd-display-mode` + reload); fundraise moved to `CmdOrCtrl+Alt+F`.
- **Tests** — `nav-manifest`, extended IPC (nav handlers, `isGameUrl` gate for absolute URLs), preload allowlist, tray toggle handler, `urls` helpers.

### Fixed

- **`navigate-to` /profile** — IPC navigation maps `/profile` to `/politician`, matching the live “My Politician” route (spec text used `/profile`).
- **Native notification spam** — SSE frames with no configured desktop notification type (including the default SSE type `message` and server events such as `theme_changed`) no longer trigger a generic “A House Divided” notification. Only types listed in the client notification map and explicit `notification` events alert the user.

### Changed

- **Pop-out windows** use session partition `persist:ahd` so login state matches the main window.
- **PiP dashboard** and **DevTools panel** windows enable `sandbox: true` to align with the main window’s renderer hardening.
- **`/api/client-nav`** — overlapping fetches share a single in-flight request; responses larger than 512 KiB are dropped to bound main-process memory use.
- **Client-nav polling** — interval is **30 seconds** while the main window is focused and **60 seconds** when unfocused (SSE connect/disconnect still restarts the timer).
- **Navigate menu & window presets** — follow the new country paths; presidential election prefers `activePresidentElectionSeatId` when present; **Navigate** includes national budget, campaign HQ, central bank, stock market, and expanded ordering toward parity with the site’s Nation dropdown.
- **IPC `set-preference`** — only `notificationsEnabled`, `miniModeEnabled`, and `displayMode` are accepted.
- **IPC `set-zoom`** — zoom factor is clamped between 0.25 and 3 and non-finite values are ignored.

### Security

- **`navigate-to`** — absolute `http(s)` URLs are loaded only when they pass the same host check as the main game window (`isGameUrl`); other origins are ignored.

---

## [1.0.1] - 2026-03-12

### Fixed

- Restore application menu bar (Game / Navigate / View / Help) on Windows — it was hidden by the `titleBarStyle: 'hidden'` setting introduced in 1.0.0

### Changed

- Removed custom titlebar overlay colours (reverted `titleBarStyle: 'hidden'` and `titleBarOverlay`) to keep the native application menu visible
- Theme background colours per theme still applied on window creation (eliminates load-flash)

---

## [1.0.0] - 2026-03-12

### Added

- **Country-aware navigation** — menus and window presets update dynamically based on the player's character country (US, UK, CA, DE)
- **`/api/client-nav` integration** — replaces `/api/auth/me`; single endpoint delivers user, nav config, unread count, party, and active election state
- **404 recovery overlay** — detects HTTP 404 responses and injects a "Page not found" overlay with a Go Home button
- **Network failure overlay** — detects connection failures and injects a "Connection lost" overlay with a retry button
- **`go-home` IPC handler** — renderer can trigger a navigation back to the game home page
- **Dynamic Navigate menu** — legislature, executive, and election items reflect the active country; My Party and Presidential Election items appear only when applicable
- **`WindowManager.updatePresets(nav)`** — congress and country window presets update their routes/titles when country changes
- **Per-theme window background colours** — eliminates white flash on load for dark themes
- **Custom titlebar overlay colours per theme** (Windows) — close/min/max buttons match the active theme
- **Turn Dashboard Widget** — replaces PiP with a full dashboard showing action points, funds, election countdown, and more
- **Dashboard Poller** — polls `/api/game/turn/dashboard` and feeds data into the tray/cache pipeline
- **Focused mode** — `ahd-display-mode` cookie hides the game's in-page navigation when using the desktop client
- **SSE integration** — real-time event stream for turn completion, notifications, and state sync
- **System tray** — game state summary, unread notification badge
- **Auto-updater** — checks for new releases on launch via `electron-updater`
- **Keyboard shortcuts** — toggle status bar, mini mode, open feedback dialog
- **Multi-window presets** — elections, congress, campaign, state, country, notifications pop-outs
- **Automated GitHub Actions release workflow** — tag `v*` triggers Windows build and uploads `.exe` to GitHub Releases

---
