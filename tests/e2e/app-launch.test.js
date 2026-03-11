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
  const title = await window.title();
  expect(title).toContain('A House Divided');
});
