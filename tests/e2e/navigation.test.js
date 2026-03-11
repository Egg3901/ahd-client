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

test('developer menu exists in dev mode', async () => {
  const hasDevMenu = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) return false;
    return menu.items.some((item) => item.label === 'Developer');
  });
  expect(hasDevMenu).toBe(true);
});
