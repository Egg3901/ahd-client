describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('exports default GAME_URL', () => {
    delete process.env.AHD_GAME_URL;
    const config = require('../../src/config');
    expect(config.GAME_URL).toBe('https://www.ahousedividedgame.com');
  });

  test('respects AHD_GAME_URL env var', () => {
    process.env.AHD_GAME_URL = 'http://localhost:3000';
    const config = require('../../src/config');
    expect(config.GAME_URL).toBe('http://localhost:3000');
  });

  test('exports correct window dimensions', () => {
    const config = require('../../src/config');
    expect(config.WINDOW_WIDTH).toBe(1280);
    expect(config.WINDOW_HEIGHT).toBe(800);
    expect(config.MIN_WIDTH).toBe(800);
    expect(config.MIN_HEIGHT).toBe(600);
  });

  test('exports update check interval of 1 hour', () => {
    const config = require('../../src/config');
    expect(config.UPDATE_CHECK_INTERVAL).toBe(3600000);
  });

  test('default SANDBOX_GAME_URL is test.ahousedividedgame.com', () => {
    delete process.env.AHD_SANDBOX_GAME_URL;
    const config = require('../../src/config');
    expect(config.SANDBOX_GAME_URL).toBe('https://test.ahousedividedgame.com');
  });

  test('getActiveGameUrl(true) returns sandbox URL', () => {
    delete process.env.AHD_GAME_URL;
    const config = require('../../src/config');
    expect(config.getActiveGameUrl(true)).toBe(config.SANDBOX_GAME_URL);
  });

  test('DEV_GAME_URL defaults to localhost:3000', () => {
    delete process.env.AHD_DEV_GAME_URL;
    const config = require('../../src/config');
    expect(config.DEV_GAME_URL).toBe('http://localhost:3000');
  });

  test('isTrustedGameUrl allows localhost', () => {
    delete process.env.AHD_GAME_URL;
    const config = require('../../src/config');
    expect(config.isTrustedGameUrl('http://localhost:3000/foo')).toBe(true);
    expect(config.isTrustedGameUrl('http://127.0.0.1:3000/')).toBe(true);
  });
});
