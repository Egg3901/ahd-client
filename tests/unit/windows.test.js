'use strict';

const { BrowserWindow } = require('electron');
const WindowManager = require('../../src/windows');
const appConfig = require('../../src/config');

beforeEach(() => {
  jest.clearAllMocks();
  BrowserWindow._reset();
});

describe('WindowManager', () => {
  describe('getPresets()', () => {
    it('returns all 6 preset keys', () => {
      const wm = new WindowManager();
      const presets = wm.getPresets();
      expect(presets).toHaveLength(6);
      expect(presets).toEqual(
        expect.arrayContaining(['elections', 'congress', 'campaign', 'state', 'country', 'notifications'])
      );
    });
  });

  describe('getPresetConfig()', () => {
    it('returns config object for "elections" with required shape', () => {
      const wm = new WindowManager();
      const cfg = wm.getPresetConfig('elections');
      expect(cfg).toBeDefined();
      expect(cfg).toHaveProperty('title');
      expect(cfg).toHaveProperty('route');
      expect(cfg).toHaveProperty('width');
      expect(cfg).toHaveProperty('height');
    });

    it('returns undefined for an invalid preset key', () => {
      const wm = new WindowManager();
      expect(wm.getPresetConfig('invalid')).toBeUndefined();
    });
  });

  describe('openWindow()', () => {
    it('creates a BrowserWindow for a valid preset', () => {
      const wm = new WindowManager();
      const win = wm.openWindow('elections');
      expect(win).toBeInstanceOf(BrowserWindow);
    });

    it('calls loadURL with the correct route for "elections"', () => {
      const wm = new WindowManager();
      wm.openWindow('elections');
      expect(BrowserWindow.prototype.loadURL).toHaveBeenCalledWith(
        `${appConfig.GAME_URL}/elections`
      );
    });

    it('returns null for an invalid preset', () => {
      const wm = new WindowManager();
      const result = wm.openWindow('nonexistent');
      expect(result).toBeNull();
    });

    it('singleton: calling twice returns the same instance and focuses it', () => {
      const wm = new WindowManager();
      const win1 = wm.openWindow('congress');
      BrowserWindow.prototype.focus.mockClear();
      const win2 = wm.openWindow('congress');
      expect(win1).toBe(win2);
      expect(BrowserWindow.prototype.focus).toHaveBeenCalledTimes(1);
    });

    it('replaces a destroyed window with a new one', () => {
      const wm = new WindowManager();
      const win1 = wm.openWindow('campaign');
      // Simulate destroyed window
      win1._destroyed = true;
      const win2 = wm.openWindow('campaign');
      expect(win2).not.toBe(win1);
      expect(win2).toBeInstanceOf(BrowserWindow);
    });

    it('stores the window in the internal map', () => {
      const wm = new WindowManager();
      const win = wm.openWindow('state');
      expect(wm.windows.get('state')).toBe(win);
    });
  });

  describe('openCustom()', () => {
    it('calls loadURL with the full URL when given an http URL', () => {
      const wm = new WindowManager();
      const fullUrl = 'https://example.com/some/page';
      wm.openCustom(fullUrl);
      expect(BrowserWindow.prototype.loadURL).toHaveBeenCalledWith(fullUrl);
    });

    it('prepends GAME_URL when given a relative path', () => {
      const wm = new WindowManager();
      const relativePath = '/some/path';
      wm.openCustom(relativePath);
      expect(BrowserWindow.prototype.loadURL).toHaveBeenCalledWith(
        `${appConfig.GAME_URL}${relativePath}`
      );
    });

    it('returns a BrowserWindow instance', () => {
      const wm = new WindowManager();
      const win = wm.openCustom('https://ahousedividedgame.com/test');
      expect(win).toBeInstanceOf(BrowserWindow);
    });
  });

  describe('closeAll()', () => {
    it('closes all open windows', () => {
      const wm = new WindowManager();
      wm.openWindow('elections');
      wm.openWindow('congress');
      wm.openWindow('campaign');

      BrowserWindow.prototype.close.mockClear();
      wm.closeAll();

      expect(BrowserWindow.prototype.close).toHaveBeenCalledTimes(3);
    });

    it('clears the windows map', () => {
      const wm = new WindowManager();
      wm.openWindow('elections');
      wm.openWindow('congress');
      wm.closeAll();
      expect(wm.windows.size).toBe(0);
    });

    it('skips already-destroyed windows', () => {
      const wm = new WindowManager();
      const win = wm.openWindow('notifications');
      win._destroyed = true;

      BrowserWindow.prototype.close.mockClear();
      wm.closeAll();
      // close() should not be called on destroyed windows
      expect(BrowserWindow.prototype.close).not.toHaveBeenCalled();
    });
  });
});
