'use strict';

const { globalShortcut } = require('electron');
const ShortcutManager = require('../../src/shortcuts');
const activeGameUrl = require('../../src/active-game-url');
const { MAIN_GAME_URL } = require('../../src/config');

function makeMockWindow(destroyed = false) {
  return {
    show: jest.fn(),
    focus: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(destroyed),
    webContents: { loadURL: jest.fn() },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  activeGameUrl.bindCache({
    getPreference: () => false,
  });
});

describe('ShortcutManager', () => {
  describe('registerAll()', () => {
    it('registers exactly 10 shortcuts', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      sm.registerAll();
      expect(globalShortcut.register).toHaveBeenCalledTimes(10);
    });

    it('is idempotent: calling twice still only registers 10 shortcuts', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      sm.registerAll();
      sm.registerAll();
      expect(globalShortcut.register).toHaveBeenCalledTimes(10);
    });

    it('sets registered to true after first call', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      expect(sm.registered).toBe(false);
      sm.registerAll();
      expect(sm.registered).toBe(true);
    });

    it('logs a warning when the OS rejects a registration (returns false)', () => {
      // globalShortcut.register signals failure via its return value, not by
      // throwing — the warning must not depend on the throw path.
      globalShortcut.register.mockReturnValueOnce(false);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);

      sm.registerAll();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register shortcut'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('unregisterAll()', () => {
    it('calls globalShortcut.unregisterAll', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      sm.registerAll();
      sm.unregisterAll();
      expect(globalShortcut.unregisterAll).toHaveBeenCalledTimes(1);
    });

    it('sets registered to false', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      sm.registerAll();
      expect(sm.registered).toBe(true);
      sm.unregisterAll();
      expect(sm.registered).toBe(false);
    });
  });

  describe('handleShortcut()', () => {
    it('calls show, focus, and loadURL with the correct URL for action=navigate', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      sm.handleShortcut({ action: 'navigate', route: '/campaign' });
      expect(win.show).toHaveBeenCalledTimes(1);
      expect(win.focus).toHaveBeenCalledTimes(1);
      expect(win.webContents.loadURL).toHaveBeenCalledWith(
        `${MAIN_GAME_URL}/campaign`,
      );
    });

    it('calls the registered custom handler for action=custom', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      const handler = jest.fn();
      sm.onCustom('toggleStatusBar', handler);
      sm.handleShortcut({ action: 'custom', handler: 'toggleStatusBar' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not throw for unregistered custom handler', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      expect(() =>
        sm.handleShortcut({ action: 'custom', handler: 'noSuchHandler' }),
      ).not.toThrow();
    });

    it('no-ops when mainWindow.isDestroyed() returns true', () => {
      const win = makeMockWindow(true);
      const sm = new ShortcutManager(win);
      sm.handleShortcut({ action: 'navigate', route: '/campaign' });
      expect(win.show).not.toHaveBeenCalled();
      expect(win.focus).not.toHaveBeenCalled();
      expect(win.webContents.loadURL).not.toHaveBeenCalled();
    });

    it('no-ops when mainWindow is null', () => {
      const sm = new ShortcutManager(null);
      expect(() =>
        sm.handleShortcut({ action: 'navigate', route: '/campaign' }),
      ).not.toThrow();
    });
  });

  describe('setWindow()', () => {
    it('updates the mainWindow reference', () => {
      const win1 = makeMockWindow();
      const win2 = makeMockWindow();
      const sm = new ShortcutManager(win1);
      expect(sm.mainWindow).toBe(win1);
      sm.setWindow(win2);
      expect(sm.mainWindow).toBe(win2);
    });

    it('uses the new window reference for subsequent handleShortcut calls', () => {
      const win1 = makeMockWindow();
      const win2 = makeMockWindow();
      const sm = new ShortcutManager(win1);
      sm.setWindow(win2);
      sm.handleShortcut({ action: 'navigate', route: '/poll' });
      expect(win2.webContents.loadURL).toHaveBeenCalledWith(
        `${MAIN_GAME_URL}/poll`,
      );
      expect(win1.webContents.loadURL).not.toHaveBeenCalled();
    });
  });
});
