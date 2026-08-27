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

test('developer menu exists in dev mode', async () => {
  const hasDevMenu = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) return false;
    return menu.items.some((item) => item.label === 'Developer');
  });
  expect(hasDevMenu).toBe(true);
});
