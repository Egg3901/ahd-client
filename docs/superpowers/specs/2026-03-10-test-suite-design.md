# Test Suite Design — AHD Desktop Client

## Summary

Layered testing pyramid for the Electron desktop client using Jest (unit + integration) and Playwright Electron (E2E). Goals: refactoring confidence, CI gating with 80% coverage thresholds, and pre-release validation of the packaged app.

## Tooling

- **Jest** — unit and integration test runner
- **Playwright** (`electron` launcher) — E2E tests against the real Electron app
- **No additional mocking libraries** — Jest built-in `jest.mock` / `jest.fn()` is sufficient

### npm Scripts

| Script | Description |
|--------|-------------|
| `test` | Unit + integration (fast, no Electron needed) |
| `test:unit` | Unit tests only |
| `test:integration` | Integration tests only |
| `test:e2e` | E2E tests (requires display) |
| `test:coverage` | Unit + integration with 80% threshold enforcement |

### Jest Configuration

Two projects in one config:
- **unit** — runs `tests/unit/**` and `tests/integration/**`, `node` test environment
- **e2e** — runs `tests/e2e/**`, custom setup that launches Electron via Playwright

## Directory Structure

```
tests/
├── __mocks__/
│   ├── electron.js          # BrowserWindow, Tray, app, Menu, etc.
│   ├── electron-store.js    # In-memory Map-based store
│   └── electron-updater.js  # Mock autoUpdater
├── unit/
│   ├── sse.test.js
│   ├── cache.test.js
│   ├── notifications.test.js
│   ├── tray.test.js
│   ├── windows.test.js
│   ├── shortcuts.test.js
│   ├── menu.test.js
│   ├── pip.test.js
│   ├── feedback.test.js
│   ├── updater.test.js
│   ├── devtools.test.js
│   ├── ipc.test.js
│   ├── config.test.js
│   └── preload.test.js
├── integration/
│   ├── sse-notifications.test.js
│   ├── game-state-flow.test.js
│   ├── ipc-handlers.test.js
│   └── theme-sync.test.js
└── e2e/
    ├── app-launch.test.js
    ├── window-management.test.js
    └── navigation.test.js
```

## Shared Mock Layer

### `tests/__mocks__/electron.js`

Mocks for all Electron APIs used by the application:

- **BrowserWindow** — `loadURL`, `loadFile`, `webContents` (with `send`, `executeJavaScript`, `on`, `once`, `capturePage`), `show`, `focus`, `close`, `isDestroyed`, `setTitle`, `setBounds`, `setProgressBar`
- **Tray** — `setContextMenu`, `setToolTip`, `setImage`, `destroy`
- **app** — `whenReady`, `quit`, `getVersion`, `getPath`, `setBadgeCount`, `on`
- **Menu** — `buildFromTemplate`, `setApplicationMenu`
- **globalShortcut** — `register`, `unregister`, `unregisterAll`
- **nativeTheme** — `themeSource` property
- **dialog** — `showMessageBox`, `showSaveDialog`
- **shell** — `openExternal`
- **session** — `fromPartition` returning cookies mock
- **ipcMain** — `handle`, `on`
- **Notification** — constructor with `show`, `on`
- **nativeImage** — `createFromPath`
- **net** — `request` returning mock ClientRequest (for SSE)

### `tests/__mocks__/electron-store.js`

In-memory Map-based store that implements `get`, `set`, `delete`, `clear`, and `has`.

### `tests/__mocks__/electron-updater.js`

Mock `autoUpdater` with `checkForUpdates`, `downloadUpdate`, `quitAndInstall`, and EventEmitter-based event methods.

## Unit Tests

| Module | Key Test Cases |
|--------|---------------|
| **sse.js** | Connect/disconnect, SSE frame parsing, JSON parse fallback to string, buffer overflow guard (1MB), exponential backoff (2s base, 60s max), event emission per type, cookie setting |
| **cache.js** | Queue add/remove/clear, preference get/set, game state merge, theme persistence, turn data caching with timestamps, unique action IDs |
| **notifications.js** | Each of 10 event types formatted correctly, only fires when window unfocused, unread count tracking, enable/disable toggle, clearUnread resets badge |
| **tray.js** | Menu rebuilds with game state, badge updates per platform (macOS vs Windows), tooltip formatting, throttled rebuild (1s), navigation routing |
| **windows.js** | Preset opens correct route/size, singleton behavior (focus existing), custom window creation with timestamp ID, closeAll cleanup |
| **shortcuts.js** | All 8 shortcuts registered, navigate shortcuts load correct URL, custom handlers invoked, unregisterAll cleanup, error handling for failed registration |
| **menu.js** | Menu structure includes all submenus, admin menu toggled by setAdmin, theme change callback fires, dev menu only in NODE_ENV=development, navigate routes correct |
| **pip.js** | Toggle open/close, game state updates display, timer start/stop (10s interval), expandToFull behavior, destroy cleanup |
| **feedback.js** | Screenshot capture returns base64, system info fields present (platform, versions, memory), temp file written |
| **updater.js** | checkForUpdates triggers autoUpdater, event handlers send correct status to renderer, prompt dialogs shown |
| **devtools.js** | Event log ring buffer capped at 500, batched UI updates (500ms throttle), server switching loads URL, cleanup destroys window and timer |
| **ipc.js** | Each of 16 handlers returns correct data, preference changes toggle notifications, queue operations work, theme sync fires |
| **config.js** | Default values correct, AHD_GAME_URL env var overrides GAME_URL |
| **preload.js** | Allowed invoke channels pass through, allowed receive channels work, blocked channels reject with error |

## Integration Tests

| Test File | What It Validates |
|-----------|-------------------|
| **sse-notifications.test.js** | SSE event emitted -> NotificationManager formats and shows correct notification -> TrayManager updates unread badge count |
| **game-state-flow.test.js** | SSE game state event -> CacheManager persists state -> TrayManager tooltip/menu updates -> PipManager display updates |
| **ipc-handlers.test.js** | registerIpcHandlers with real module instances, invoke each IPC channel, verify correct side effects on modules |
| **theme-sync.test.js** | Menu theme selection -> CacheManager stores theme -> nativeTheme.themeSource changes -> renderer receives theme event |

## E2E Tests (Playwright Electron)

| Test File | What It Validates |
|-----------|-------------------|
| **app-launch.test.js** | App starts without crash, loading screen displays, navigates to game URL, window title set correctly, tray icon created |
| **window-management.test.js** | Pop-out window presets open/focus/close correctly, PiP toggle creates mini window, multi-window cleanup on quit |
| **navigation.test.js** | Menu items navigate to correct routes, external links open in system browser (blocked in-app) |

## Coverage Thresholds

Enforced in Jest config and CI:

- **Branches:** 80%
- **Lines:** 80%
- **Functions:** 80%
- **Statements:** 80%

## CI Integration

- `npm test` runs in CI on every push/PR (unit + integration, fast, no display needed)
- `npm run test:e2e` runs separately with xvfb (or Windows display) for E2E
- Coverage report uploaded as CI artifact
- PR blocked if coverage drops below thresholds
