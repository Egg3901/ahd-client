# :link: A House Divided — Desktop Client

> Thin Electron wrapper for the A House Divided web application — play natively on Windows, macOS, and Linux.

---

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue" alt="version 0.1.0" />
  <img src="https://img.shields.io/badge/last%20commit-recent-green" alt="last commit recent" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" />
  <img src="https://img.shields.io/badge/code%20style-prettier-ff69b4" alt="code style prettier" />
  <img src="https://img.shields.io/badge/license-proprietary-red" alt="license proprietary" />
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
| Code Style  | Prettier                          |
| Node        | v20+                              |

---

## :link: Project Structure

```
ahd-client/
├── assets/              # App icons (icon.png, icon.ico, icon.icns)
├── src/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Secure context bridge
│   ├── config.js        # Game URL & window settings
│   └── loading.html     # Splash screen
├── .prettierrc          # Prettier configuration
├── package.json         # Dependencies & build config
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

Set the game server URL via environment variable (defaults to `https://ahousedividedgame.com`):

```bash
AHD_GAME_URL=https://your-server.com npm start
```

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

## :link: Code Style

This project uses [Prettier](https://prettier.io/) for consistent formatting.

```bash
# Format all files
npm run format

# Check formatting without writing
npm run format:check
```

---

## :link: Related

- **[A House Divided](https://github.com/Egg3901/a-house-divided)** — Main game (Next.js / React / MongoDB)

---

## :link: License

Proprietary — All rights reserved.
