'use strict';

const { globalShortcut } = require('electron');
const ShortcutManager = require('../../src/shortcuts');
const config = require('../../src/config');

function makeMockWindow(destroyed = false) {
  return {
    show: jest.fn(),
    focus: jest.fn(),
    loadURL: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(destroyed),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ShortcutManager', () => {
  describe('registerAll()', () => {
    it('registers exactly 8 shortcuts', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      sm.registerAll();
      expect(globalShortcut.register).toHaveBeenCalledTimes(8);
    });

    it('is idempotent: calling twice still only registers 8 shortcuts', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      sm.registerAll();
      sm.registerAll();
      expect(globalShortcut.register).toHaveBeenCalledTimes(8);
    });

    it('sets registered to true after first call', () => {
      const win = makeMockWindow();
      const sm = new ShortcutManager(win);
      expect(sm.registered).toBe(false);
      sm.registerAll();
      expect(sm.registered).toBe(true);
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
      expect(win.loadURL).toHaveBeenCalledWith(`${config.GAME_URL}/campaign`);
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
        sm.handleShortcut({ action: 'custom', handler: 'noSuchHandler' })
      ).not.toThrow();
    });

    it('no-ops when mainWindow.isDestroyed() returns true', () => {
      const win = makeMockWindow(true);
      const sm = new ShortcutManager(win);
      sm.handleShortcut({ action: 'navigate', route: '/campaign' });
      expect(win.show).not.toHaveBeenCalled();
      expect(win.focus).not.toHaveBeenCalled();
      expect(win.loadURL).not.toHaveBeenCalled();
    });

    it('no-ops when mainWindow is null', () => {
      const sm = new ShortcutManager(null);
      expect(() =>
        sm.handleShortcut({ action: 'navigate', route: '/campaign' })
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
      expect(win2.loadURL).toHaveBeenCalledWith(`${config.GAME_URL}/poll`);
      expect(win1.loadURL).not.toHaveBeenCalled();
    });
  });
});
