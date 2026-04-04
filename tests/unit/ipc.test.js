'use strict';

jest.mock('../../src/site-api', () => ({
  postJsonAuthed: jest.fn().mockResolvedValue({ ok: true, statusCode: 200 }),
}));

const { ipcMain, shell } = require('electron');
const siteApi = require('../../src/site-api');
const { registerIpcHandlers } = require('../../src/ipc');

describe('registerIpcHandlers', () => {
  let handlers;
  let deps;

  beforeEach(() => {
    handlers = {};
    siteApi.postJsonAuthed.mockClear();
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    deps = {
      cacheManager: {
        getGameState: jest.fn().mockReturnValue({ turn: 1 }),
        getCachedTurnData: jest.fn().mockReturnValue({ cached: true }),
        getTheme: jest.fn().mockReturnValue('default'),
        setTheme: jest.fn(),
        getPreference: jest.fn().mockReturnValue(true),
        setPreference: jest.fn(),
        updateGameState: jest.fn(),
      },
      actionQueue: {
        add: jest.fn().mockReturnValue(1),
        getPending: jest.fn().mockReturnValue([{ id: 'a' }]),
        reportResult: jest.fn(),
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
      fetchClientNav: jest.fn().mockResolvedValue(null),
      enrichClientNavManifest: jest.fn(async (m) => m),
      isGameUrl: jest.fn().mockReturnValue(true),
    };

    registerIpcHandlers(deps);
  });

  test('registers handlers including theme-changed-on-site and focused-view nav IPC', () => {
    expect(ipcMain.handle).toHaveBeenCalled();
    expect(handlers['theme-changed-on-site']).toBeDefined();
    expect(handlers['fetch-nav-data']).toBeDefined();
    expect(handlers['navigate-to']).toBeDefined();
    expect(handlers['open-external']).toBeDefined();
    expect(handlers['switch-character']).toBeDefined();
    expect(handlers['sign-out']).toBeDefined();
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

  test('queue-action delegates to actionQueue.add and returns length', async () => {
    const action = { type: 'vote' };
    const result = await handlers['queue-action']({}, action);
    expect(deps.actionQueue.add).toHaveBeenCalledWith(action);
    expect(result).toBe(1);
  });

  // --- get-queue ---

  test('get-queue returns actionQueue.getPending()', async () => {
    const result = await handlers['get-queue']();
    expect(deps.actionQueue.getPending).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'a' }]);
  });

  // --- action-result ---

  test('action-result delegates to actionQueue.reportResult', async () => {
    await handlers['action-result'](
      {},
      { id: 'abc', success: true, error: undefined },
    );
    expect(deps.actionQueue.reportResult).toHaveBeenCalledWith(
      'abc',
      true,
      undefined,
    );
  });

  test('action-result passes error string on failure', async () => {
    await handlers['action-result'](
      {},
      { id: 'xyz', success: false, error: 'timeout' },
    );
    expect(deps.actionQueue.reportResult).toHaveBeenCalledWith(
      'xyz',
      false,
      'timeout',
    );
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
    // getTheme returns 'default', so 'dark' is different
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

  test('set-preference ignores keys outside the whitelist', async () => {
    await handlers['set-preference']({}, { key: 'malicious', value: 1 });
    expect(deps.cacheManager.setPreference).not.toHaveBeenCalled();
  });

  // --- set-zoom ---

  test('set-zoom clamps factor to [0.25, 3]', async () => {
    await handlers['set-zoom']({}, 100);
    expect(deps.mainWindow.webContents.setZoomFactor).toHaveBeenLastCalledWith(
      3,
    );
    await handlers['set-zoom']({}, 0.01);
    expect(deps.mainWindow.webContents.setZoomFactor).toHaveBeenLastCalledWith(
      0.25,
    );
  });

  test('set-zoom ignores non-finite factor', async () => {
    deps.mainWindow.webContents.setZoomFactor.mockClear();
    await handlers['set-zoom']({}, Number.NaN);
    expect(deps.mainWindow.webContents.setZoomFactor).not.toHaveBeenCalled();
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

  // --- fetch-nav-data ---

  test('fetch-nav-data returns null when fetchClientNav returns null', async () => {
    deps.fetchClientNav.mockResolvedValue(null);
    const result = await handlers['fetch-nav-data']();
    expect(result).toBeNull();
  });

  test('fetch-nav-data normalizes country id and returns enriched manifest', async () => {
    deps.fetchClientNav.mockResolvedValue({
      character_countryId: 'DE',
      hasCharacter: false,
    });
    deps.enrichClientNavManifest.mockImplementation(async (m) => ({
      ...m,
      enriched: true,
    }));
    const result = await handlers['fetch-nav-data']();
    expect(result.characterCountryId).toBe('DE');
    expect(result.enriched).toBe(true);
  });

  // --- navigate-to ---

  test('navigate-to loads GAME_URL + path for absolute-style path', async () => {
    deps.mainWindow.loadURL.mockClear();
    await handlers['navigate-to']({}, '/campaign');
    expect(deps.mainWindow.loadURL).toHaveBeenCalledWith(
      `${deps.config.GAME_URL}/campaign`,
    );
  });

  test('navigate-to loads /profile as-is (focused nav spec)', async () => {
    deps.mainWindow.loadURL.mockClear();
    await handlers['navigate-to']({}, '/profile');
    expect(deps.mainWindow.loadURL).toHaveBeenCalledWith(
      `${deps.config.GAME_URL}/profile`,
    );
  });

  test('navigate-to prepends slash for path without leading slash', async () => {
    deps.mainWindow.loadURL.mockClear();
    await handlers['navigate-to']({}, 'wiki');
    expect(deps.mainWindow.loadURL).toHaveBeenCalledWith(
      `${deps.config.GAME_URL}/wiki`,
    );
  });

  test('navigate-to loads https URL when isGameUrl returns true', async () => {
    deps.isGameUrl.mockReturnValue(true);
    const gamePage = 'https://ahousedividedgame.com/actions';
    await handlers['navigate-to']({}, gamePage);
    expect(deps.mainWindow.loadURL).toHaveBeenCalledWith(gamePage);
  });

  test('navigate-to does not load https URL when isGameUrl returns false', async () => {
    deps.isGameUrl.mockReturnValue(false);
    deps.mainWindow.loadURL.mockClear();
    await handlers['navigate-to']({}, 'https://evil.example/phish');
    expect(deps.mainWindow.loadURL).not.toHaveBeenCalled();
  });

  // --- open-external ---

  test('open-external calls shell.openExternal with url', async () => {
    await handlers['open-external']({}, 'https://discord.gg/test');
    expect(shell.openExternal).toHaveBeenCalledWith('https://discord.gg/test');
  });

  test('open-external ignores empty url', async () => {
    shell.openExternal.mockClear();
    await handlers['open-external']({}, '');
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  // --- switch-character / sign-out ---

  test('switch-character posts active-character and reloads home', async () => {
    deps.mainWindow.loadURL.mockClear();
    await handlers['switch-character']({}, 'char-uuid');
    expect(siteApi.postJsonAuthed).toHaveBeenCalledWith(
      deps.config.GAME_URL,
      '/api/auth/active-character',
      { characterId: 'char-uuid' },
    );
    expect(deps.mainWindow.loadURL).toHaveBeenCalledWith(deps.config.GAME_URL);
  });

  test('sign-out posts logout and reloads home', async () => {
    deps.mainWindow.loadURL.mockClear();
    await handlers['sign-out']();
    expect(siteApi.postJsonAuthed).toHaveBeenCalledWith(
      deps.config.GAME_URL,
      '/api/auth/logout',
      null,
    );
    expect(deps.mainWindow.loadURL).toHaveBeenCalledWith(deps.config.GAME_URL);
  });
});
