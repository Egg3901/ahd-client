# :link: A House Divided — Desktop Client

> Thin Electron wrapper for the A House Divided web application — play natively on Windows, macOS, and Linux.

---

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-blue" alt="version 1.1.0" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" />
  <img src="https://img.shields.io/badge/license-proprietary-red" alt="license proprietary" />
</p>

<p align="center">
  <img src="https://github.com/Egg3901/ahd-client/actions/workflows/ci.yml/badge.svg" alt="CI" />
  <img src="https://github.com/Egg3901/ahd-client/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white" alt="Electron 33" />
  <img src="https://img.shields.io/badge/node-v20%2B-339933?logo=node.js&logoColor=white" alt="node v20+" />
  <img src="https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey" alt="platform win | mac | linux" />
</p>

---

## :link: Overview

**A House Divided** is a browser-based political simulation where players create politicians, compete in elections, form coalitions, pass legislation, and climb from state office to national leadership. The game runs on a turn-based economy (1 turn = 1 real hour) with persistent world state across multiple countries.

This repository contains the **desktop client** — a thin Electron shell that wraps the hosted Next.js web application, providing a native desktop experience without duplicating game logic.

### Why a desktop client?

- Native window management and system tray integration
- Persistent sessions across restarts
- Keyboard shortcuts and custom menus
- Cross-platform packaging (Windows, macOS, Linux)
- Future: push notifications, offline detection, auto-updates

---

## :link: Tech Stack

| Layer       | Technology                        |
| ----------- | --------------------------------- |
| Shell       | Electron 33                       |
| Game Server | Next.js / React (hosted remotely) |
| Packaging   | electron-builder                  |
| Linter      | ESLint 10                         |
| Code Style  | Prettier                          |
| Node        | v20+                              |

---

## :link: Project Structure

```
ahd-client/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml           # Lint, format check, tests on every push/PR
│   │   ├── codeql.yml       # GitHub CodeQL security scanning
│   │   └── release.yml      # Build & publish Win / Mac / Linux on version tag
│   └── dependabot.yml       # Weekly dependency update PRs
├── assets/                  # App icons (icon.png, icon.ico, icon.icns)
├── src/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Secure context bridge
│   ├── config.js            # Game URL & window settings
│   └── loading.html         # Splash screen
├── tests/
├── eslint.config.js         # ESLint flat config
├── .prettierrc              # Prettier configuration
├── CHANGELOG.md
├── package.json
└── .gitignore
```

---

## :link: Getting Started

### Prerequisites

- **Node.js** v20 or later
- **npm** v10 or later

### Installation

```bash
# Clone the repository
git clone https://github.com/Egg3901/ahd-client.git
cd ahd-client

# Install dependencies
npm install
```

### Development

```bash
# Run in development mode (with DevTools menu)
npm run dev

# Run in production mode
npm start
```

### Configuration

**Override the loaded origin** (disables View menu server toggles):

```bash
AHD_GAME_URL=https://your-server.com npm start
```

**Defaults:** main game `https://www.ahousedividedgame.com` (`AHD_MAIN_GAME_URL`), test/sandbox `https://test.ahousedividedgame.com` (`AHD_SANDBOX_GAME_URL`). **Localhost** (`AHD_DEV_GAME_URL`, default `http://localhost:3000`) is available from the View menu when you run a **development build** (`npm run dev`, `NODE_ENV=development`) **or** when signed in as a **game admin**.

---

## :link: Building

Package the app for distribution:

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:win
npm run build:mac
npm run build:linux
```

Output goes to the `dist/` directory.

---

## :link: Releases

Releases are automated via GitHub Actions. To publish a new version:

1. Bump the version in `package.json` and update [CHANGELOG.md](CHANGELOG.md)
2. Tag and push:

```bash
git tag v1.1.0
git push origin v1.1.0
```

The workflow in [`.github/workflows/release.yml`](.github/workflows/release.yml) runs tests, then builds **Windows** (NSIS installer), **macOS** (DMG), and **Linux** (AppImage) and uploads them to one GitHub Release.

**Code signing:** Installers are **unsigned** (no Windows Authenticode or Apple Developer ID). On macOS, users may need to **right-click the app → Open** the first time. Set `CSC_IDENTITY_AUTO_DISCOVERY=false` is already applied in CI and in `npm run build:mac` / `build:win`.

See [CHANGELOG.md](CHANGELOG.md) for release history.

---

## :link: Code Quality

```bash
# Lint
npm run lint
npm run lint:fix

# Format
npm run format
npm run format:check

# Tests
npm test
npm run test:coverage
```

### CI checks (run on every push and PR)

| Check                    | Tool       | Workflow     |
| ------------------------ | ---------- | ------------ |
| Unit & integration tests | Jest       | `ci.yml`     |
| Linting                  | ESLint 10  | `ci.yml`     |
| Formatting               | Prettier   | `ci.yml`     |
| Security scanning        | CodeQL     | `codeql.yml` |
| Dependency updates       | Dependabot | weekly PRs   |

---

## :link: Related

- **[A House Divided](https://github.com/Egg3901/a-house-divided)** — Main game (Next.js / React / MongoDB)

---

## :link: License

Proprietary — All rights reserved.
