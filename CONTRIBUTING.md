# Contributing

Bug fixes, desktop integration polish, tests, accessibility improvements, and documentation updates are welcome.

Read [the architecture guide](./docs/architecture.md) before changing navigation, the preload bridge, IPC, sessions, or window ownership.

## Development workflow

```bash
npm ci
npm run lint
npm run format:check
npm test
```

Open a focused pull request against `master`. Add tests for main-process and IPC behavior, and update `CHANGELOG.md` for user-visible changes.

Keep the remote-content boundary narrow: no Node integration in game windows, no unvalidated IPC payloads, no broad navigation allowlists, and no secrets or session data in logs.

Report vulnerabilities through [SECURITY.md](./SECURITY.md), not public issues.
