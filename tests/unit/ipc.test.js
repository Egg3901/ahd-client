'use strict';

const { ipcMain } = require('electron');
const { registerIpcHandlers } = require('../../src/ipc');

describe('registerIpcHandlers', () => {
  let handlers;
  let deps;

  beforeEach(() => {
    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    deps = {
      cacheManager: {
        getGameState: jest.fn().mockReturnValue({ turn: 1 }),
        getCachedTurnData: jest.fn().mockReturnValue({ cached: true }),
        getQueuedActions: jest.fn().mockReturnValue([{ id: 'a' }]),
        getTheme: jest.fn().mockReturnValue('default'),
        setTheme: jest.fn(),
        getPreference: jest.fn().mockReturnValue(true),
        setPreference: jest.fn(),
        updateGameState: jest.fn(),
      },
      actionQueue: {
        enqueue: jest.fn().mockReturnValue(1),
        complete: jest.fn(),
        fail: jest.fn(),
        clear: jest.fn(),
      },
      errorHandler: {
        getMappings: jest
          .fn()
          .mockReturnValue({ NOT_FOUND: { title: 'Page Not Found' } }),
      },
      notificationManager: {
        setEnabled: jest.fn(),
      },
      menuManager: {
        setAdmin: jest.fn(),
      },
      windowManager: {
        openWindow: jest.fn(),
      },
      pipManager: {
        toggle: jest.fn(),
      },
      feedbackManager: {
        captureScreenshot: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
        getSystemInfo: jest.fn().mockReturnValue({ os: 'win32' }),
      },
      updateManager: {
        checkForUpdates: jest.fn(),
      },
      sseClient: {
        isConnected: jest.fn().mockReturnValue(true),
      },
      mainWindow: {
        loadURL: jest.fn(),
        isDestroyed: jest.fn().mockReturnValue(false),
        webContents: {
          canGoBack: jest.fn().mockReturnValue(true),
          canGoForward: jest.fn().mockReturnValue(true),
          goBack: jest.fn(),
          goForward: jest.fn(),
          setZoomFactor: jest.fn(),
          getZoomFactor: jest.fn().mockReturnValue(1),
        },
      },
      config: { GAME_URL: 'https://ahousedividedgame.com' },
      syncNativeTheme: jest.fn(),
      handleGameStateEvent: jest.fn(),
      pushThemeToSite: jest.fn(),
    };

    registerIpcHandlers(deps);
  });

  test('registers handlers including theme-changed-on-site and new queue/error channels', () => {
    expect(ipcMain.handle).toHaveBeenCalled();
    expect(handlers['theme-changed-on-site']).toBeDefined();
    expect(handlers['complete-action']).toBeDefined();
    expect(handlers['fail-action']).toBeDefined();
    expect(handlers['clear-queue']).toBeDefined();
    expect(handlers['get-error-codes']).toBeDefined();
  });

  // --- get-game-state ---

  test('get-game-state returns cacheManager.getGameState()', async () => {
    const result = await handlers['get-game-state']();
    expect(deps.cacheManager.getGameState).toHaveBeenCalled();
    expect(result).toEqual({ turn: 1 });
  });

  // --- get-cached-turn ---

  test('get-cached-turn returns cacheManager.getCachedTurnData()', async () => {
    const result = await handlers['get-cached-turn']();
    expect(deps.cacheManager.getCachedTurnData).toHaveBeenCalled();
    expect(result).toEqual({ cached: true });
  });

  // --- queue-action ---

  test('queue-action calls actionQueue.enqueue and returns length', async () => {
    const action = { type: 'vote' };
    const result = await handlers['queue-action']({}, action);
    expect(deps.actionQueue.enqueue).toHaveBeenCalledWith(action);
    expect(result).toBe(1);
  });

  // --- complete-action ---

  test('complete-action calls actionQueue.complete with actionId', async () => {
    await handlers['complete-action']({}, 'action-123');
    expect(deps.actionQueue.complete).toHaveBeenCalledWith('action-123');
  });

  // --- fail-action ---

  test('fail-action calls actionQueue.fail with actionId and error', async () => {
    await handlers['fail-action']({}, { actionId: 'action-123', error: 'network error' });
    expect(deps.actionQueue.fail).toHaveBeenCalledWith('action-123', 'network error');
  });

  // --- clear-queue ---

  test('clear-queue calls actionQueue.clear()', async () => {
    await handlers['clear-queue']();
    expect(deps.actionQueue.clear).toHaveBeenCalled();
  });

  // --- get-queue ---

  test('get-queue returns getQueuedActions()', async () => {
    const result = await handlers['get-queue']();
    expect(deps.cacheManager.getQueuedActions).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'a' }]);
  });

  // --- get-error-codes ---

  test('get-error-codes returns errorHandler.getMappings()', async () => {
    const result = await handlers['get-error-codes']();
    expect(deps.errorHandler.getMappings).toHaveBeenCalled();
    expect(result).toEqual({ NOT_FOUND: { title: 'Page Not Found' } });
  });

  // --- get-theme ---

  test('get-theme returns cacheManager.getTheme()', async () => {
    const result = await handlers['get-theme']();
    expect(deps.cacheManager.getTheme).toHaveBeenCalled();
    expect(result).toBe('default');
  });

  // --- set-theme ---

  test('set-theme calls setTheme, syncNativeTheme, and pushThemeToSite', async () => {
    await handlers['set-theme']({}, 'dark');
    expect(deps.cacheManager.setTheme).toHaveBeenCalledWith('dark');
    expect(deps.syncNativeTheme).toHaveBeenCalledWith('dark');
    expect(deps.pushThemeToSite).toHaveBeenCalledWith('dark');
  });

  // --- theme-changed-on-site ---

  test('theme-changed-on-site calls setTheme and syncNativeTheme when theme differs', async () => {
    deps.cacheManager.getTheme.mockReturnValue('default');
    await handlers['theme-changed-on-site']({}, 'dark');
    expect(deps.cacheManager.setTheme).toHaveBeenCalledWith('dark');
    expect(deps.syncNativeTheme).toHaveBeenCalledWith('dark');
  });

  test('theme-changed-on-site no-ops when theme is the same', async () => {
    deps.cacheManager.getTheme.mockReturnValue('dark');
    await handlers['theme-changed-on-site']({}, 'dark');
    expect(deps.cacheManager.setTheme).not.toHaveBeenCalled();
    expect(deps.syncNativeTheme).not.toHaveBeenCalled();
  });

  // --- get-preferences ---

  test('get-preferences returns theme and notificationsEnabled', async () => {
    deps.cacheManager.getTheme.mockReturnValue('dark');
    deps.cacheManager.getPreference.mockReturnValue(true);
    const result = await handlers['get-preferences']();
    expect(result).toEqual({ theme: 'dark', notificationsEnabled: true });
  });

  // --- set-preference ---

  test('set-preference with key=notificationsEnabled calls notificationManager.setEnabled', async () => {
    await handlers['set-preference'](
      {},
      { key: 'notificationsEnabled', value: false },
    );
    expect(deps.cacheManager.setPreference).toHaveBeenCalledWith(
      'notificationsEnabled',
      false,
    );
    expect(deps.notificationManager.setEnabled).toHaveBeenCalledWith(false);
  });

  test('set-preference with other key does not call notificationManager.setEnabled', async () => {
    await handlers['set-preference'](
      {},
      { key: 'miniModeEnabled', value: true },
    );
    expect(deps.cacheManager.setPreference).toHaveBeenCalledWith(
      'miniModeEnabled',
      true,
    );
    expect(deps.notificationManager.setEnabled).not.toHaveBeenCalled();
  });

  // --- update-game-state ---

  test('update-game-state calls handleGameStateEvent with wrapped state', async () => {
    const state = { turn: 5 };
    await handlers['update-game-state']({}, state);
    expect(deps.handleGameStateEvent).toHaveBeenCalledWith({ data: state });
  });

  // --- open-window ---

  test('open-window calls windowManager.openWindow with preset and mainWindow', async () => {
    await handlers['open-window']({}, 'pip');
    expect(deps.windowManager.openWindow).toHaveBeenCalledWith(
      'pip',
      deps.mainWindow,
    );
  });

  // --- toggle-pip ---

  test('toggle-pip calls pipManager.toggle()', async () => {
    await handlers['toggle-pip']();
    expect(deps.pipManager.toggle).toHaveBeenCalled();
  });

  // --- capture-screenshot ---

  test('capture-screenshot calls feedbackManager.captureScreenshot and returns base64 string', async () => {
    const result = await handlers['capture-screenshot']();
    expect(deps.feedbackManager.captureScreenshot).toHaveBeenCalled();
    expect(typeof result).toBe('string');
    expect(result).toBe(Buffer.from('fake-png').toString('base64'));
  });

  test('capture-screenshot returns null when screenshot is null', async () => {
    deps.feedbackManager.captureScreenshot.mockResolvedValue(null);
    const result = await handlers['capture-screenshot']();
    expect(result).toBeNull();
  });

  // --- get-system-info ---

  test('get-system-info returns feedbackManager.getSystemInfo()', async () => {
    const result = await handlers['get-system-info']();
    expect(deps.feedbackManager.getSystemInfo).toHaveBeenCalled();
    expect(result).toEqual({ os: 'win32' });
  });

  // --- check-updates ---

  test('check-updates calls updateManager.checkForUpdates()', async () => {
    await handlers['check-updates']();
    expect(deps.updateManager.checkForUpdates).toHaveBeenCalled();
  });

  // --- get-sse-status ---

  test('get-sse-status returns connected boolean from sseClient', async () => {
    deps.sseClient.isConnected.mockReturnValue(true);
    const result = await handlers['get-sse-status']();
    expect(result).toEqual({ connected: true });
  });

  test('get-sse-status returns connected: false when disconnected', async () => {
    deps.sseClient.isConnected.mockReturnValue(false);
    const result = await handlers['get-sse-status']();
    expect(result).toEqual({ connected: false });
  });

  // --- set-admin ---

  test('set-admin calls menuManager.setAdmin with isAdmin value', async () => {
    await handlers['set-admin']({}, true);
    expect(deps.menuManager.setAdmin).toHaveBeenCalledWith(true);
  });

  // --- go-home ---

  test('go-home calls mainWindow.loadURL with GAME_URL', async () => {
    await handlers['go-home']();
    expect(deps.mainWindow.loadURL).toHaveBeenCalledWith(deps.config.GAME_URL);
  });
});
