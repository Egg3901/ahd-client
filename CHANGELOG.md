# Changelog

All notable changes to the A House Divided desktop client are documented here.

---

## [1.0.3] - 2026-04-06

### Added

- **Game menu — customizable quick links** — The Game menu opens with shortcuts (Profile, Campaign HQ, Notifications, Portfolio, corporation). **Customize Game Panel…** opens a small window to enable or disable built-in links and add custom paths; the layout is stored in `userPreferences.gamePanelEntries`.
- **CEO / Create a corporation** — The corporation shortcut is included by default. The menu label is **CEO** (navigates to `/corporation/{id}/ceo`) when the character is a CEO with a corporation id; otherwise it reads **Create a corporation** and navigates to `/corporation/create`. Client-nav enrichment merges `isCeo` and `myCorporationId` from `/api/character/me`.
- **IPC** — `get-game-panel-config`, `set-game-panel-entries`, and `reset-game-panel-entries` support the config window (`game-panel-config.html` + preload).
- **Active game URL** — `src/active-game-url.js` resolves the current game origin; works with environment-driven config and dev/sandbox toggles (`src/game-server-dev.js`).
- **PiP / turn dashboard** — Richer floating dashboard (AP bar with per-action counts, funds and income, decay stats, election chip, expandable income and stat detail).

### Changed

- **Main process URL loading** — Components that previously used a fixed `config.GAME_URL` now use `activeGameUrl.get()` where appropriate so dev, sandbox, and production origins stay consistent (menus, tray, shortcuts, windows, SSE, dashboard, devtools, error handler, etc.).

### Tests

- Unit coverage for `game-panel-links`, `active-game-url`, and `game-server-dev`.

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
