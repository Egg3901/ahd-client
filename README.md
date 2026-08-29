# A House Divided Desktop

<img src="assets/ahd-logo.png" alt="" width="96" align="right">

The desktop client for [A House Divided](https://www.ahousedividedgame.com). It wraps the hosted game in Electron and adds native windows, menus, tray behavior, shortcuts, notifications, pop-outs, and a compact picture-in-picture status view on Windows, macOS, and Linux.

The game itself lives in [`Egg3901/AHDGame`](https://github.com/Egg3901/AHDGame). This repository contains only the desktop shell.

## What it adds

**Native navigation.** Game, Navigate, View, and Help menus provide stable entry points into a large web application. Country-aware links and auxiliary pop-out windows share the same authenticated session.

**Focused play.** Mini mode, a configurable status bar, global shortcuts, tray controls, and focused-mode chrome keep frequently checked information available without a full browser tab.

**Bulk actions the web UI makes tedious.** CEOs can set the wage level across every sector of their corporation in one step, paced to the server's write budget so large corporations apply cleanly instead of stalling against the rate limiter.

**One trusted origin boundary.** The main window loads an approved game origin into the persistent `persist:ahd` session. IPC and navigation policy stay in the Electron main and preload layers rather than being exposed directly to remote page code.

## How it runs

```text
Electron main process
  -> trusted BrowserWindow and persistent session
  -> hosted A House Divided application

Native integrations
  -> constrained preload bridge and IPC handlers
  -> menus, tray, shortcuts, notifications, PiP, and pop-outs
```

See [Architecture](./docs/architecture.md) for process boundaries, navigation policy, the preload bridge, and IPC contracts.

## Running locally

Requires Node.js 22 or newer. Some runtime dependencies are ESM-only, which needs `require(esm)` support (Node ≥ 22.12); Electron 42 bundles Node 22.x, so this matches what ships.

```bash
git clone https://github.com/Egg3901/ahd-client.git
cd ahd-client
npm ci
npm run dev
```

`npm start` runs with production-style menus. Override the loaded origin only when testing a trusted deployment:

```bash
AHD_GAME_URL=http://localhost:3000 npm run dev
```

Development mode can also switch between the production, sandbox, and local game origins from the View menu.

## Development

The desktop shell has three runtime boundaries worth keeping in mind: the Electron main process owns privileged OS APIs, preload exposes a narrow bridge to the remote game page, and `site-api.js` performs authenticated background requests through the shared `persist:ahd` session. See [Architecture](./docs/architecture.md) before changing any of these boundaries.

```bash
npm run lint
npm run format:check
npm test               # unit + integration (Electron is mocked)
npm run test:e2e       # Playwright against a real Electron build
npm run test:coverage
```

Run `npm run test:e2e` before any dependency bump that touches Electron. The unit suite mocks `electron`, `electron-store`, and `electron-updater`, so it can pass against a build that does not launch — that is exactly how the Electron 42 upgrade nearly shipped broken.

Commits are checked by commitlint against [Conventional Commits](https://www.conventionalcommits.org/); `npm install` sets up the git hook.

### Mock game server

`npm run mock` serves stubbed game endpoints on `http://localhost:3000`, including the corporation and wage routes, and mirrors the server's rate limiter so paced flows can be exercised locally.

```bash
npm run mock                                   # 4 sectors, 20 writes/min
MOCK_SECTORS=105 MOCK_WINDOW_MS=3000 npm run mock   # large corp, fast window
npm run mock:client                            # point the client at it
```

Useful entry points:

- `src/main.js` owns application lifecycle and window orchestration. Feature modules are created there and receive dependencies/callbacks rather than reaching into each other's state.
- `src/preload.js` exposes the constrained page bridge.
- `src/ipc.js` registers trusted IPC handlers.
- `src/config.js` defines approved origins and environment overrides.
- `src/menu.js`, `src/tray.js`, and `src/shortcuts.js` own OS integration.
- `src/pip.js` and related modules own the compact status view.
- `tests/` contains unit, integration, and end-to-end coverage.

## Building

```bash
npm run build          # current platform
npm run build:win
npm run build:mac
npm run build:linux
```

Artifacts are written to `dist/`. CI builds unsigned Windows, macOS, and Linux artifacts from version tags and attaches them to a GitHub release. Unsigned macOS and Windows builds may trigger platform trust prompts.

See [the documentation index](./docs/README.md), [the changelog](./CHANGELOG.md), and the release workflow for the complete packaging contract.

## Security

Treat every loaded page as remote content. Keep navigation allowlists narrow, expose the minimum preload API, validate every IPC message in the main process, and never enable Node integration in the game window. See [Contributing](./CONTRIBUTING.md) for normal changes and [Security](./SECURITY.md) for private vulnerability reporting.

## License

[MIT](./LICENSE). The A House Divided name, logo, hosted game, and game assets are separate from this client license.
