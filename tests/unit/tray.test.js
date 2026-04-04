'use strict';

const { Tray, Menu } = require('electron');
const TrayManager = require('../../src/tray');
const config = require('../../src/config');

function makeMockWindow() {
  return {
    show: jest.fn(),
    focus: jest.fn(),
    loadURL: jest.fn(),
    isVisible: jest.fn().mockReturnValue(true),
    isDestroyed: jest.fn().mockReturnValue(false),
    setProgressBar: jest.fn(),
  };
}

function makeMockNotificationManager() {
  return { getUnreadCount: jest.fn().mockReturnValue(0) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TrayManager', () => {
  describe('create()', () => {
    it('sets tray to a non-null value after create()', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      expect(tm.tray).toBeNull();
      tm.create();
      expect(tm.tray).not.toBeNull();
    });

    it('constructs a Tray instance', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();
      expect(tm.tray).toBeInstanceOf(Tray);
    });

    it('calls setToolTip on the tray', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();
      expect(Tray.prototype.setToolTip).toHaveBeenCalled();
    });
  });

  describe('initial gameState', () => {
    it('has "?" for turnsUntilElection', () => {
      const tm = new TrayManager(null, null);
      expect(tm.gameState.turnsUntilElection).toBe('?');
    });

    it('has "?" for actionPoints', () => {
      const tm = new TrayManager(null, null);
      expect(tm.gameState.actionPoints).toBe('?');
    });

    it('has empty string for currentDate', () => {
      const tm = new TrayManager(null, null);
      expect(tm.gameState.currentDate).toBe('');
    });
  });

  describe('updateGameState()', () => {
    it('merges partial state without clearing other fields', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      // Initialize tray so rebuildMenu works
      tm.create();
      jest.clearAllMocks();

      tm.updateGameState({ turnsUntilElection: 5 });
      expect(tm.gameState.turnsUntilElection).toBe(5);
      // actionPoints should still be '?'
      expect(tm.gameState.actionPoints).toBe('?');
    });

    it('merges multiple fields at once', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();
      jest.clearAllMocks();

      tm.updateGameState({
        turnsUntilElection: 3,
        actionPoints: 10,
        currentDate: '1862-01-01',
      });
      expect(tm.gameState.turnsUntilElection).toBe(3);
      expect(tm.gameState.actionPoints).toBe(10);
      expect(tm.gameState.currentDate).toBe('1862-01-01');
    });

    it('preserves existing fields when only partial update is given', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();
      tm.updateGameState({ turnsUntilElection: 7, actionPoints: 4 });
      jest.clearAllMocks();

      tm.updateGameState({ currentDate: '1863-06-01' });
      expect(tm.gameState.turnsUntilElection).toBe(7);
      expect(tm.gameState.actionPoints).toBe(4);
      expect(tm.gameState.currentDate).toBe('1863-06-01');
    });
  });

  describe('updateMenu() throttling', () => {
    it('multiple rapid calls only trigger rebuildMenu once after 1000ms', () => {
      jest.useFakeTimers();
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();

      // Spy on rebuildMenu after create() to count calls from updateMenu
      const rebuildSpy = jest.spyOn(tm, 'rebuildMenu');

      tm.updateMenu();
      tm.updateMenu();
      tm.updateMenu();

      // Should not have been called yet
      expect(rebuildSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1000);

      // Should have been called exactly once
      expect(rebuildSpy).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('allows a second rebuild after throttle window expires', () => {
      jest.useFakeTimers();
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();

      const rebuildSpy = jest.spyOn(tm, 'rebuildMenu');

      tm.updateMenu();
      jest.advanceTimersByTime(1000);
      expect(rebuildSpy).toHaveBeenCalledTimes(1);

      tm.updateMenu();
      jest.advanceTimersByTime(1000);
      expect(rebuildSpy).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });

  describe('navigateTo()', () => {
    it('calls loadURL with the correct full URL', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.navigateTo('/campaign');
      expect(win.loadURL).toHaveBeenCalledWith(`${config.GAME_URL}/campaign`);
    });

    it('calls show on mainWindow', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.navigateTo('/notifications');
      expect(win.show).toHaveBeenCalled();
    });

    it('calls focus on mainWindow', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.navigateTo('/poll');
      expect(win.focus).toHaveBeenCalled();
    });

    it('does nothing when mainWindow is null', () => {
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(null, nm);
      expect(() => tm.navigateTo('/campaign')).not.toThrow();
    });
  });

  describe('destroy()', () => {
    it('sets tray to null', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();
      expect(tm.tray).not.toBeNull();
      tm.destroy();
      expect(tm.tray).toBeNull();
    });

    it('clears _menuThrottle', () => {
      jest.useFakeTimers();
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();
      tm.updateMenu(); // sets _menuThrottle
      expect(tm._menuThrottle).not.toBeNull();
      tm.destroy();
      expect(tm._menuThrottle).toBeNull();
      jest.useRealTimers();
    });

    it('calls destroy on the tray instance', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();
      const trayInstance = tm.tray;
      tm.destroy();
      expect(trayInstance.destroy).toHaveBeenCalled();
    });

    it('is safe to call when tray is already null', () => {
      const tm = new TrayManager(null, null);
      expect(() => tm.destroy()).not.toThrow();
    });
  });

  describe('setWindow()', () => {
    it('updates the mainWindow reference', () => {
      const win1 = makeMockWindow();
      const win2 = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win1, nm);
      expect(tm.mainWindow).toBe(win1);
      tm.setWindow(win2);
      expect(tm.mainWindow).toBe(win2);
    });
  });

  describe('setFocusedViewToggleHandler()', () => {
    it('rebuilds menu with Toggle Focused View and invokes handler on click', () => {
      const win = makeMockWindow();
      const nm = makeMockNotificationManager();
      const tm = new TrayManager(win, nm);
      tm.create();
      jest.clearAllMocks();
      const handler = jest.fn();
      tm.setFocusedViewToggleHandler(handler);
      expect(Menu.buildFromTemplate).toHaveBeenCalled();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      const toggleItem = template.find(
        (i) => i.label === 'Toggle Focused View',
      );
      expect(toggleItem).toBeDefined();
      toggleItem.click();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
