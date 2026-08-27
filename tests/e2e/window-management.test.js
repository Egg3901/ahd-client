const { test, expect } = require('@playwright/test');
const { launchApp } = require('./launch-app');

let app;

test.beforeAll(async () => {
  app = await launchApp();
  await app.firstWindow();
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('app starts with at least one window', async () => {
  const windows = app.windows();
  expect(windows.length).toBeGreaterThanOrEqual(1);
});

test('main window is accessible', async () => {
  const window = await app.firstWindow();
  // The app navigates from the local loading screen to the game server right
  // after launch; evaluate() can hit a destroyed execution context mid-swap.
  await expect
    .poll(
      async () => {
        try {
          return await window.evaluate(() => true);
        } catch {
          return false;
        }
      },
      { timeout: 15_000 },
    )
    .toBe(true);
});
