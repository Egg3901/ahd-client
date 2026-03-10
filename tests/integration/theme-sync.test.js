'use strict';

const { nativeTheme } = require('electron');
const CacheManager = require('../../src/cache');

// Copy exact logic from src/main.js
function syncNativeTheme(themeId) {
  const lightThemes = ['light', 'pastel', 'usa'];
  nativeTheme.themeSource = lightThemes.includes(themeId) ? 'light' : 'dark';
}

describe('syncNativeTheme integration', () => {
  /** @type {CacheManager} */
  let cache;

  beforeEach(() => {
    cache = new CacheManager();
    // Reset nativeTheme to a neutral state before each test
    nativeTheme.themeSource = 'system';
  });

  test("'light' sets themeSource to 'light'", () => {
    cache.setTheme('light');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('light');
  });

  test("'pastel' sets themeSource to 'light'", () => {
    cache.setTheme('pastel');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('light');
  });

  test("'usa' sets themeSource to 'light'", () => {
    cache.setTheme('usa');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('light');
  });

  test("'default' sets themeSource to 'dark'", () => {
    cache.setTheme('default');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('dark');
  });

  test("'oled' sets themeSource to 'dark'", () => {
    cache.setTheme('oled');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('dark');
  });

  test("'dark-pastel' sets themeSource to 'dark'", () => {
    cache.setTheme('dark-pastel');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('dark');
  });
});
