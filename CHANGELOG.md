# Changelog

All notable changes to the A House Divided desktop client are documented here.

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
