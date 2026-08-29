# Documentation

| Document                             | Audience     | Contents                                               |
| ------------------------------------ | ------------ | ------------------------------------------------------ |
| [README.md](../README.md)            | Everyone     | Setup, build, release, CI                              |
| [architecture.md](./architecture.md) | Contributors | Main process layout, session, client-nav, IPC overview |
| [CHANGELOG.md](../CHANGELOG.md)      | Maintainers  | Version history                                        |

The game itself is documented in the main [A House Divided](https://github.com/Egg3901/a-house-divided) repository; this folder only covers the **Electron desktop shell**.

## Where to start

- **Changing a remote-content boundary:** read [Architecture](./architecture.md), then inspect `config.js`, `safe-load-url.js`, `preload.js`, and `ipc.js` together.
- **Adding a native feature:** keep lifecycle ownership in `main.js`, put feature behavior in a focused module, and expose only the smallest preload/IPC surface required.
- **Changing game API calls:** use `site-api.js` so requests share the persistent session, client-version header, response limits, and non-throwing failure behavior.
- **Changing navigation or server selection:** update the active-origin and allowlist logic together; test both production/sandbox and local development paths.

## Documentation expectations

Comments should explain security boundaries, lifecycle ownership, retry/backoff decisions, persistence semantics, or compatibility constraints—not restate obvious JavaScript. When behavior changes, update the architecture guide and `CHANGELOG.md` if the change is user-visible.
