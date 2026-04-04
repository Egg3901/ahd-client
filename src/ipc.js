const { ipcMain, shell } = require('electron');
const siteApi = require('./site-api');
const { normalizeClientNavManifest } = require('./nav-manifest');
const { resolveGamePath } = require('./game-paths');

/** Preferences the renderer may change via set-preference (theme uses set-theme). */
const ALLOWED_PREFERENCE_KEYS /** @type {ReadonlySet<string>} */ = new Set([
  'notificationsEnabled',
  'miniModeEnabled',
  'displayMode',
]);

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

/**
 * Register all IPC handlers for renderer <-> main communication.
 * Each handler corresponds to a channel whitelisted in preload.js.
 *
 * @param {{
 *   cacheManager: import('./cache'),
 *   notificationManager: import('./notifications'),
 *   menuManager: import('./menu'),
 *   windowManager: import('./windows'),
 *   pipManager: import('./pip'),
 *   feedbackManager: import('./feedback'),
 *   updateManager: import('./updater'),
 *   sseClient: import('./sse'),
 *   mainWindow: Electron.BrowserWindow,
 *   syncNativeTheme: (themeId: string) => void,
 *   handleGameStateEvent: (event: {data: object}) => void,
 * }} deps - Module references injected from main.js
 */
function registerIpcHandlers(deps) {
  const {
    cacheManager,
    actionQueue,
    notificationManager,
    menuManager,
    windowManager,
    pipManager,
    feedbackManager,
    updateManager,
    sseClient,
    mainWindow,
    syncNativeTheme,
    handleGameStateEvent,
    pushThemeToSite,
    config,
    fetchClientNav,
    enrichClientNavManifest,
    isGameUrl,
  } = deps;

  ipcMain.handle('get-game-state', () => {
    return cacheManager ? cacheManager.getGameState() : {};
  });

  ipcMain.handle('get-cached-turn', () => {
    return cacheManager ? cacheManager.getCachedTurnData() : {};
  });

  ipcMain.handle('queue-action', (_event, action) => {
    if (!actionQueue) return 0;
    return actionQueue.add(action);
  });

  ipcMain.handle('get-queue', () => {
    return actionQueue ? actionQueue.getPending() : [];
  });

  ipcMain.handle('action-result', (_event, { id, success, error }) => {
    if (actionQueue) actionQueue.reportResult(id, success, error);
  });

  ipcMain.handle('get-theme', () => {
    return cacheManager ? cacheManager.getTheme() : 'default';
  });

  ipcMain.handle('set-theme', (_event, themeId) => {
    if (cacheManager) {
      cacheManager.setTheme(themeId);
      syncNativeTheme(themeId);
      pushThemeToSite(themeId);
    }
  });

  ipcMain.handle('theme-changed-on-site', (_event, themeId) => {
    if (cacheManager && themeId !== cacheManager.getTheme()) {
      cacheManager.setTheme(themeId);
      syncNativeTheme(themeId);
    }
  });

  ipcMain.handle('get-preferences', () => {
    if (!cacheManager) return {};
    return {
      theme: cacheManager.getTheme(),
      notificationsEnabled:
        cacheManager.getPreference('notificationsEnabled') !== false,
    };
  });

  ipcMain.handle('set-preference', (_event, { key, value }) => {
    if (!cacheManager || !ALLOWED_PREFERENCE_KEYS.has(key)) return;
    cacheManager.setPreference(key, value);
    if (key === 'notificationsEnabled' && notificationManager) {
      notificationManager.setEnabled(value);
    }
  });

  ipcMain.handle('update-game-state', (_event, state) => {
    handleGameStateEvent({ data: state });
  });

  ipcMain.handle('open-window', (_event, preset) => {
    if (windowManager) windowManager.openWindow(preset, mainWindow);
  });

  ipcMain.handle('toggle-pip', () => {
    if (pipManager) pipManager.toggle();
  });

  ipcMain.handle('capture-screenshot', async () => {
    if (feedbackManager) {
      const png = await feedbackManager.captureScreenshot();
      return png ? png.toString('base64') : null;
    }
    return null;
  });

  ipcMain.handle('get-system-info', () => {
    return feedbackManager ? feedbackManager.getSystemInfo() : {};
  });

  ipcMain.handle('check-updates', () => {
    if (updateManager) updateManager.checkForUpdates();
  });

  ipcMain.handle('get-sse-status', () => {
    return { connected: sseClient ? sseClient.isConnected() : false };
  });

  ipcMain.handle('set-admin', (_event, isAdmin) => {
    if (menuManager) menuManager.setAdmin(isAdmin);
  });

  ipcMain.handle('go-back', () => {
    if (mainWindow && mainWindow.webContents.navigationHistory.canGoBack()) {
      mainWindow.webContents.navigationHistory.goBack();
    }
  });

  ipcMain.handle('go-forward', () => {
    if (mainWindow && mainWindow.webContents.navigationHistory.canGoForward()) {
      mainWindow.webContents.navigationHistory.goForward();
    }
  });

  ipcMain.handle('set-zoom', (_event, factor) => {
    if (!mainWindow) return;
    const n = Number(factor);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
    mainWindow.webContents.setZoomFactor(clamped);
  });

  ipcMain.handle('get-zoom', () => {
    return mainWindow ? mainWindow.webContents.getZoomFactor() : 1;
  });

  ipcMain.handle('go-home', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(config.GAME_URL);
    }
  });

  ipcMain.handle('fetch-nav-data', async () => {
    const raw = await fetchClientNav();
    if (!raw) return null;
    const normalized = normalizeClientNavManifest(raw);
    return enrichClientNavManifest(normalized);
  });

  ipcMain.handle('navigate-to', (_event, url) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const u = String(url || '');
    if (u.startsWith('http')) {
      try {
        if (isGameUrl(u)) mainWindow.loadURL(u);
      } catch {
        /* ignore */
      }
      return;
    }
    const path = resolveGamePath(u);
    mainWindow.loadURL(`${config.GAME_URL}${path}`);
  });

  ipcMain.handle('open-external', (_event, url) => {
    const u = String(url || '');
    if (u) shell.openExternal(u);
  });

  ipcMain.handle('switch-character', async (_event, characterId) => {
    await siteApi.postJsonAuthed(
      config.GAME_URL,
      '/api/auth/active-character',
      {
        characterId,
      },
    );
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(config.GAME_URL);
    }
  });

  ipcMain.handle('sign-out', async () => {
    await siteApi.postJsonAuthed(config.GAME_URL, '/api/auth/logout', null);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(config.GAME_URL);
    }
  });
}

module.exports = { registerIpcHandlers };
