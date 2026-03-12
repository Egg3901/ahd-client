const { ipcMain } = require('electron');

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
  } = deps;

  ipcMain.handle('get-game-state', () => {
    return cacheManager ? cacheManager.getGameState() : {};
  });

  ipcMain.handle('get-cached-turn', () => {
    return cacheManager ? cacheManager.getCachedTurnData() : {};
  });

  ipcMain.handle('queue-action', (_event, action) => {
    if (!cacheManager) return 0;
    return cacheManager.queueAction(action);
  });

  ipcMain.handle('get-queue', () => {
    return cacheManager ? cacheManager.getQueuedActions() : [];
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
    if (cacheManager) cacheManager.setPreference(key, value);
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
    if (mainWindow) mainWindow.webContents.setZoomFactor(factor);
  });

  ipcMain.handle('get-zoom', () => {
    return mainWindow ? mainWindow.webContents.getZoomFactor() : 1;
  });

  ipcMain.handle('go-home', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(config.GAME_URL);
    }
  });
}

module.exports = { registerIpcHandlers };
