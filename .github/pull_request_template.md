## What & why

<!-- What does this change, and what problem does it solve? Link the issue. -->

## Checklist

- [ ] `npm run lint`, `npm run format:check`, and `npm test` pass locally (the CI gate)
- [ ] `npm run test:e2e` run if this touches Electron, dependencies, startup, or window creation — the unit suite mocks Electron and cannot catch a build that fails to launch
- [ ] `CHANGELOG.md` entry added (if user-visible)
- [ ] No new preload channel, IPC handler, or allowed origin — or the trust boundary change is called out below

## Trust boundary

<!-- Delete if not applicable. Note any new preload channel, IPC handler,
     navigation allowlist entry, or anything that widens what remote page
     code can reach. -->
