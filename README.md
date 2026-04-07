# A House Divided — Desktop Client

Thin Electron wrapper for the [A House Divided](https://github.com/Egg3901/a-house-divided) web app: native window, menus, tray, shortcuts, and optional PiP on **Windows, macOS, and Linux**.

---

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.0-blue" alt="version 1.2.0" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license MIT" />
</p>

<p align="center">
  <img src="https://github.com/Egg3901/ahd-client/actions/workflows/ci.yml/badge.svg" alt="CI" />
  <img src="https://github.com/Egg3901/ahd-client/actions/workflows/release.yml/badge.svg" alt="Release" />
  <img src="https://github.com/Egg3901/ahd-client/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white" alt="Electron 33" />
  <img src="https://img.shields.io/badge/node-v20%2B-339933?logo=node.js&logoColor=white" alt="node v20+" />
  <img src="https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey" alt="platform win | mac | linux" />
</p>

---

## Overview

The game runs as a hosted Next.js app. This client loads that site in a `BrowserWindow`, adds OS integration, and keeps one login session via the `persist:ahd` cookie jar.

More detail for contributors: **[docs/architecture.md](docs/architecture.md)** and **[docs/README.md](docs/README.md)**.

### Why use the desktop client?

- Application menu (**Game**, **Navigate**, **View**, **Help**) aligned with focused mode
- System tray, optional **mini mode (PiP)** dashboard, and desktop notifications
- **Pop-out** auxiliary windows (elections, legislature, etc.) sharing the same session
- Global keyboard shortcuts (customizable)
- **Auto-update** checks via `electron-updater` (when publishing update metadata)

---

## Features (players)

| Feature                                           | Where                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| Quick links (Profile, Campaign, Notifications, …) | **Game** menu; **Customize Game Panel…** to change presets and custom URLs |
| PiP status bar (AP, funds, turn, …)               | Same config window → **PiP status bar** tab                                |
| Global shortcuts                                  | Same window → **Keyboard Shortcuts** tab (stored per machine)              |
| Country-aware **Navigate** menu                   | **Navigate** → Profile, state, nation, world; **Pop Out Window** presets   |
| Focused vs classic site chrome                    | **View** → **Focused Mode** (or `CmdOrCtrl+Shift+F` by default)            |
| Sandbox / dev game URL                            | **View** → **Game server** (when not using `AHD_GAME_URL`)                 |

**macOS unsigned builds:** the distributed DMG is not notarized. The first launch may require **right-click the app → Open** (or Security & Privacy) to bypass Gatekeeper.

---

## Tech stack

| Layer     | Technology               |
| --------- | ------------------------ |
| Shell     | Electron 33              |
| Game UI   | Next.js / React (remote) |
| Packaging | electron-builder         |
| Lint      | ESLint 10                |
| Format    | Prettier                 |
| Tests     | Jest                     |
| Node      | v20+                     |

---

## Project structure

```
ahd-client/
├── .github/workflows/
│   ├── ci.yml           # Lint, format, tests (push / PR to master)
│   ├── release.yml    # Tag v* → test + Win / Mac / Linux artifacts → GitHub Release
│   └── codeql.yml
├── assets/              # icon.ico, icon.icns, icon.png
├── docs/
│   ├── README.md        # Doc index
│   └── architecture.md  # Main process, client-nav, IPC (contributors)
├── src/
│   ├── main.js          # App entry, lifecycle, client-nav orchestration
│   ├── preload.js       # window.ahdClient bridge for the game page
│   ├── ipc.js           # IPC handler registration
│   ├── menu.js          # Application menu
│   ├── config.js        # URLs, trusted hosts
│   ├── active-game-url.js
│   ├── pip.js / pip.html / pip-view-poller.js
│   ├── dashboard.js
│   ├── shortcuts.js
│   ├── game-panel-config.html / game-panel-config-*.js
│   └── …                # tray, sse, cache, windows, nav, site-api, etc.
├── tests/
├── CHANGELOG.md
├── package.json
└── README.md
```

---

## Getting started

**Prerequisites:** Node.js v20+, npm v10+.

```bash
git clone https://github.com/Egg3901/ahd-client.git
cd ahd-client
npm install
```

**Run:**

```bash
npm run dev    # DevTools menu, optional localhost server toggle in View
npm start      # Production-style (no DevTools menu)
```

**Override game origin** (disables View menu server toggles):

```bash
AHD_GAME_URL=https://your-server.com npm start
```

**Defaults:** production `https://www.ahousedividedgame.com` (`AHD_MAIN_GAME_URL`), sandbox `https://test.ahousedividedgame.com` (`AHD_SANDBOX_GAME_URL`), local dev `http://localhost:3000` (`AHD_DEV_GAME_URL`). The localhost option appears in **View** when running `npm run dev` or when signed in as a **game admin**.

---

## npm scripts

| Script                                                    | Purpose                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm start`                                               | Run Electron (production menu)                                     |
| `npm run dev`                                             | `NODE_ENV=development`                                             |
| `npm run build`                                           | electron-builder for **current** OS                                |
| `npm run build:win` / `build:mac` / `npm run build:linux` | Target one platform (unsigned; see `package.json` env for Win/Mac) |
| `npm test`                                                | Jest                                                               |
| `npm run test:unit` / `test:integration` / `test:e2e`     | Subsets                                                            |
| `npm run lint` / `lint:fix`                               | ESLint                                                             |
| `npm run format` / `format:check`                         | Prettier                                                           |

Artifacts land in **`dist/`**.

---

## Releases

1. Bump **`package.json`** version and add an entry to **[CHANGELOG.md](CHANGELOG.md)**.
2. Push a **version tag**:

```bash
git tag v1.1.0
git push origin v1.1.0
```

[`.github/workflows/release.yml`](.github/workflows/release.yml) runs tests on Ubuntu, then builds **Windows** (NSIS), **macOS** (DMG), and **Linux** (AppImage) on native runners and attaches them to one GitHub Release.

**Signing:** CI uses **`CSC_IDENTITY_AUTO_DISCOVERY=false`** so builds succeed without Windows or Apple signing certificates. Local `npm run build:win` / `build:mac` do the same.

---

## Code quality

```bash
npm run lint
npm run format:check
npm test
npm run test:coverage
```

| Check               | Workflow            |
| ------------------- | ------------------- |
| Lint, format, tests | `ci.yml`            |
| Security            | `codeql.yml`        |
| Dependencies        | Dependabot (weekly) |

---

## Contributing

1. Branch from `master`, run **lint**, **format:check**, and **tests** before opening a PR.
2. Describe user-visible changes in **CHANGELOG.md** when behavior changes.
3. Read **[docs/architecture.md](docs/architecture.md)** before large main-process changes.

---

## Related

- **[A House Divided](https://github.com/Egg3901/a-house-divided)** — Game (Next.js / MongoDB)

---

## License

[MIT](package.json) (see `package.json`).
