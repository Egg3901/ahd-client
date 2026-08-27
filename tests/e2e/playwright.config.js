const { defineConfig } = require('@playwright/test');

/** Port for the stub game server the suite runs against. */
const MOCK_PORT = Number(process.env.AHD_E2E_MOCK_PORT || 3210);

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 1,
  // Every spec launches its own Electron application, and Playwright's
  // default worker count (half the cores) started three at once. On a loaded
  // machine the extra ones lost the 30s race for `firstWindow`, which looks
  // exactly like a real startup regression. Electron launch is the
  // bottleneck, not test count — the suite runs in seconds serially.
  workers: 1,
  fullyParallel: false,
  // Boot the stub game server for the suite. Without this the client falls
  // back to config.js's default origin — the LIVE production site — so every
  // run, CI included, depended on production being reachable and fast enough
  // to satisfy a 30s title assertion. That was the flake, and CI had no
  // business loading production in the first place.
  webServer: {
    command: `node ${require('path').join(__dirname, '..', '..', 'scripts', 'mock-game-server.js')}`,
    url: `http://127.0.0.1:${MOCK_PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { ...process.env, MOCK_PORT: String(MOCK_PORT) },
  },
  use: {
    trace: 'on-first-retry',
  },
});

module.exports.MOCK_PORT = MOCK_PORT;
