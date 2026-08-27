const { test, expect } = require('@playwright/test');
const { launchApp } = require('./launch-app');

let app;

test.beforeAll(async () => {
  app = await launchApp();
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('app launches and creates a window', async () => {
  const window = await app.firstWindow();
  expect(window).toBeTruthy();
});

test('window title contains A House Divided', async () => {
  const window = await app.firstWindow();
  // The title starts as "Loading <url>" while the game server page loads;
  // toHaveTitle retries until the real title (which contains the site name
  // via the page-title-updated handler) appears.
  await expect(window).toHaveTitle(/A House Divided/, { timeout: 30_000 });
});
