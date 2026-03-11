const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

let app;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '..', '..', '.')],
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });
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
  const isCallable = await window.evaluate(() => true);
  expect(isCallable).toBe(true);
});
