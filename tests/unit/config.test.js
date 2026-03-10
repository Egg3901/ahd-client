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
    expect(config.GAME_URL).toBe('https://ahousedividedgame.com');
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
});
