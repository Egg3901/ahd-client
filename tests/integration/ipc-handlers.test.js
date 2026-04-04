'use strict';

const { ipcMain, BrowserWindow } = require('electron');
const { registerIpcHandlers } = require('../../src/ipc');
const CacheManager = require('../../src/cache');
const NotificationManager = require('../../src/notifications');
const ActionQueue = require('../../src/action-queue');

describe('IPC Handlers Integration', () => {
  /** @type {Record<string, Function>} */
  let handlers;
  /** @type {CacheManager} */
  let cache;
  /** @type {ActionQueue} */
  let actionQueue;
  /** @type {NotificationManager} */
  let notifications;
  /** @type {Electron.BrowserWindow} */
  let mockWindow;

  beforeEach(() => {
    handlers = {};

    // Capture real handlers by channel name
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mockWindow = new BrowserWindow();

    cache = new CacheManager();
    actionQueue = new ActionQueue(cache, jest.fn());
    notifications = new NotificationManager(mockWindow);

    registerIpcHandlers({
      cacheManager: cache,
      actionQueue,
      errorHandler: { getMappings: jest.fn().mockReturnValue({}) },
      compatibilityChecker: { getStatus: jest.fn().mockReturnValue({ compatible: true, issueCount: 0, issues: [] }) },
      notificationManager: notifications,
      menuManager: { setAdmin: jest.fn() },
      windowManager: { openWindow: jest.fn() },
      pipManager: { toggle: jest.fn() },
      feedbackManager: {
        captureScreenshot: jest.fn().mockResolvedValue(null),
        getSystemInfo: jest.fn().mockReturnValue({}),
      },
      updateManager: { checkForUpdates: jest.fn() },
      sseClient: { isConnected: jest.fn().mockReturnValue(false) },
      mainWindow: mockWindow,
      syncNativeTheme: jest.fn(),
      handleGameStateEvent: jest.fn(),
      pushThemeToSite: jest.fn(),
    });
  });

  test('queue-action then get-queue: queued action appears with correct type', async () => {
    const action = { type: 'VOTE_BILL', billId: 42 };

    const queueLength = await handlers['queue-action'](null, action);
    expect(queueLength).toBe(1);

    const queue = await handlers['get-queue']();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('VOTE_BILL');
  });

  test('set-theme then get-theme: theme is persisted and retrieved', async () => {
    await handlers['set-theme'](null, 'patriot');

    const theme = await handlers['get-theme']();
    expect(theme).toBe('patriot');
  });

  test('set-preference notificationsEnabled=false disables NotificationManager', async () => {
    // Confirm it starts enabled
    expect(notifications.enabled).toBe(true);

    await handlers['set-preference'](null, {
      key: 'notificationsEnabled',
      value: false,
    });

    expect(notifications.enabled).toBe(false);
  });

  test('get-preferences reflects stored theme after set-theme', async () => {
    await handlers['set-theme'](null, 'patriot');

    const prefs = await handlers['get-preferences']();
    expect(prefs.theme).toBe('patriot');
  });
});
