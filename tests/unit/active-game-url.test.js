'use strict';

describe('active-game-url', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.AHD_GAME_URL;
    delete process.env.AHD_DEV_GAME_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('get() uses DEV_GAME_URL when NODE_ENV=development and useDevServer', () => {
    process.env.NODE_ENV = 'development';
    const activeGameUrl = require('../../src/active-game-url');
    activeGameUrl.bindCache({
      getPreference: (key) =>
        key === 'useDevServer'
          ? true
          : key === 'useSandboxServer'
            ? true
            : false,
    });
    const config = require('../../src/config');
    expect(activeGameUrl.get()).toBe(config.DEV_GAME_URL);
  });

  test('get() prefers dev server over sandbox when both flags were set (dev wins)', () => {
    process.env.NODE_ENV = 'development';
    const activeGameUrl = require('../../src/active-game-url');
    activeGameUrl.bindCache({
      getPreference: (key) =>
        key === 'useDevServer' || key === 'useSandboxServer',
    });
    const config = require('../../src/config');
    expect(activeGameUrl.get()).toBe(config.DEV_GAME_URL);
  });

  test('get() ignores useDevServer in production when not admin', () => {
    process.env.NODE_ENV = 'production';
    const activeGameUrl = require('../../src/active-game-url');
    activeGameUrl.setAdminProvider(() => false);
    activeGameUrl.bindCache({
      getPreference: (key) =>
        key === 'useDevServer' || key === 'useSandboxServer',
    });
    const config = require('../../src/config');
    expect(activeGameUrl.get()).toBe(config.SANDBOX_GAME_URL);
  });

  test('get() uses DEV_GAME_URL in production when admin and useDevServer', () => {
    process.env.NODE_ENV = 'production';
    const activeGameUrl = require('../../src/active-game-url');
    activeGameUrl.setAdminProvider(() => true);
    activeGameUrl.bindCache({
      getPreference: (key) =>
        key === 'useDevServer'
          ? true
          : key === 'useSandboxServer'
            ? false
            : false,
    });
    const config = require('../../src/config');
    expect(activeGameUrl.get()).toBe(config.DEV_GAME_URL);
  });
});
