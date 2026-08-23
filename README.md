# A House Divided Desktop

<img src="assets/ahd-logo.png" alt="" width="96" align="right">

The desktop client for [A House Divided](https://www.ahousedividedgame.com). It wraps the hosted game in Electron and adds native windows, menus, tray behavior, shortcuts, notifications, pop-outs, and a compact picture-in-picture status view on Windows, macOS, and Linux.

The game itself lives in [`Egg3901/AHDGame`](https://github.com/Egg3901/AHDGame). This repository contains only the desktop shell.

## What it adds

**Native navigation.** Game, Navigate, View, and Help menus provide stable entry points into a large web application. Country-aware links and auxiliary pop-out windows share the same authenticated session.

**Focused play.** Mini mode, a configurable status bar, global shortcuts, tray controls, and focused-mode chrome keep frequently checked information available without a full browser tab.

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

Requires Node.js 20 or newer.

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

```bash
npm run lint
npm run format:check
npm test
npm run test:coverage
```

Useful entry points:

- `src/main.js` owns application lifecycle and window orchestration.
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
