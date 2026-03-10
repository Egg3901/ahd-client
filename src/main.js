const {
  app,
  BrowserWindow,
  shell,
  session,
  ipcMain,
  globalShortcut,
  nativeTheme,
} = require('electron');
const path = require('path');
const config = require('./config');

// Modules
const SSEClient = require('./sse');
const NotificationManager = require('./notifications');
const TrayManager = require('./tray');
const WindowManager = require('./windows');
const ShortcutManager = require('./shortcuts');
const MenuManager = require('./menu');
const CacheManager = require('./cache');
const UpdateManager = require('./updater');
const PipManager = require('./pip');
const FeedbackManager = require('./feedback');
const DevToolsManager = require('./devtools');

// Singletons
let mainWindow = null;
let sseClient = null;
let notificationManager = null;
let trayManager = null;
let windowManager = null;
let shortcutManager = null;
let menuManager = null;
let cacheManager = null;
let updateManager = null;
let pipManager = null;
let feedbackManager = null;
let devToolsManager = null;

function createWindow() {
  // Initialize cache first to restore preferences
  cacheManager = new CacheManager();

  mainWindow = new BrowserWindow({
    width: config.WINDOW_WIDTH,
    height: config.WINDOW_HEIGHT,
    minWidth: config.MIN_WIDTH,
    minHeight: config.MIN_HEIGHT,
    title: 'A House Divided',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:ahd',
    },
    show: false,
  });

  // Show the loading screen while the game loads
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // After the loading screen renders, navigate to the game server
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.loadURL(config.GAME_URL);
  });

  // When the game page finishes loading, update the title
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    mainWindow.setTitle(`A House Divided \u2014 ${title}`);
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(config.GAME_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Handle navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(config.GAME_URL) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanup();
  });

  // Sync saved theme to nativeTheme on launch
  const savedTheme = cacheManager.getTheme();
  syncNativeTheme(savedTheme);

  // Clear unread when window is focused
  mainWindow.on('focus', () => {
    if (notificationManager) {
      notificationManager.clearUnread();
    }
    if (trayManager) {
      trayManager.updateMenu();
    }
  });

  initModules();
}

function initModules() {
  // --- SSE Client (#1) ---
  sseClient = new SSEClient();

  // Extract auth cookies from the session and pass to SSE
  mainWindow.webContents.on('did-navigate', () => {
    session
      .fromPartition('persist:ahd')
      .cookies.get({ url: config.GAME_URL })
      .then((cookies) => {
        const cookieString = cookies
          .map((c) => `${c.name}=${c.value}`)
          .join('; ');
        sseClient.setCookie(cookieString);
        if (!sseClient.isConnected()) {
          sseClient.connect();
        }
      })
      .catch(() => {});
  });

  // --- Notifications (#1) ---
  notificationManager = new NotificationManager(mainWindow);
  notificationManager.setEnabled(
    cacheManager.getPreference('notificationsEnabled') !== false,
  );

  sseClient.on('event', (event) => {
    notificationManager.handleSSEEvent(event);

    // Update tray on every event
    if (trayManager) {
      trayManager.updateMenu();
    }
  });

  // --- Tray (#2) ---
  trayManager = new TrayManager(mainWindow, notificationManager);
  trayManager.create();

  // Restore cached game state to tray
  const cachedGameState = cacheManager.getGameState();
  if (cachedGameState.turnsUntilElection) {
    trayManager.updateGameState(cachedGameState);
  }

  // --- Window Manager (#3) ---
  windowManager = new WindowManager();

  // --- Shortcuts (#4) ---
  shortcutManager = new ShortcutManager(mainWindow);
  shortcutManager.onCustom('toggleStatusBar', () => {
    mainWindow.webContents.executeJavaScript(
      "document.dispatchEvent(new CustomEvent('ahd-toggle-statusbar'))",
    );
  });
  shortcutManager.onCustom('openFeedback', () => {
    if (feedbackManager) feedbackManager.openFeedbackDialog();
  });
  shortcutManager.onCustom('toggleMiniMode', () => {
    if (pipManager) pipManager.toggle();
  });
  shortcutManager.registerAll();

  // --- PiP (#8) ---
  pipManager = new PipManager(mainWindow);

  // --- Feedback (#9) ---
  feedbackManager = new FeedbackManager(mainWindow);

  // --- Dev Tools (#10) ---
  devToolsManager = new DevToolsManager(mainWindow, sseClient);

  // Log all SSE events in dev mode
  sseClient.on('event', (event) => {
    if (devToolsManager) devToolsManager.logEvent(event);
  });

  // --- Menu (#5) ---
  menuManager = new MenuManager(mainWindow, windowManager, {
    onThemeChange: (themeId) => {
      cacheManager.setTheme(themeId);
      syncNativeTheme(themeId);
    },
    onTogglePip: () => pipManager.toggle(),
    onOpenFeedback: () => feedbackManager.openFeedbackDialog(),
  });

  // Add dev menu in development mode
  if (process.env.NODE_ENV === 'development') {
    menuManager.onOpenEventLog = () => devToolsManager.openEventLog();
  }

  menuManager.build();

  // --- Auto-updater (#7) ---
  updateManager = new UpdateManager(mainWindow);
  // Check for updates 10 seconds after launch
  setTimeout(() => updateManager.checkForUpdates(), 10000);

  // --- SSE event handlers for game state (#2, #6, #8) ---
  sseClient.on('event', (event) => {
    handleGameStateEvent(event);
  });

  // --- Cache turn data (#6) ---
  sseClient.on('turn_complete', (data) => {
    cacheManager.cacheTurnData(data);
  });

  // SSE connection status logging
  sseClient.on('connected', () => {
    console.log('SSE connected');
    sendToRenderer('sse-status', { connected: true });

    // Flush queued actions
    const queued = cacheManager.getQueuedActions();
    if (queued.length > 0) {
      sendToRenderer('flush-queue', queued);
      cacheManager.clearQueue();
    }
  });

  sseClient.on('disconnected', () => {
    console.log('SSE disconnected');
    sendToRenderer('sse-status', { connected: false });
  });

  sseClient.on('reconnecting', ({ delay, attempt }) => {
    console.log(`SSE reconnecting in ${delay}ms (attempt ${attempt})`);
    sendToRenderer('sse-status', { connected: false, reconnecting: true });
  });
}

function handleGameStateEvent(event) {
  const gameState = {};
  const data = event.data || {};

  if (data.turnsUntilElection !== undefined) {
    gameState.turnsUntilElection = data.turnsUntilElection;
  }
  if (data.actionPoints !== undefined) {
    gameState.actionPoints = data.actionPoints;
  }
  if (data.currentDate !== undefined) {
    gameState.currentDate = data.currentDate;
  }
  if (data.nextTurnIn !== undefined) {
    gameState.nextTurnIn = data.nextTurnIn;
  }

  if (Object.keys(gameState).length > 0) {
    // Update tray
    if (trayManager) trayManager.updateGameState(gameState);
    // Update PiP
    if (pipManager) pipManager.updateGameState(gameState);
    // Cache state
    cacheManager.updateGameState(gameState);
  }
}

function syncNativeTheme(themeId) {
  // Map theme IDs to nativeTheme settings
  const darkThemes = ['default', 'dark', 'gilded', 'federal'];
  nativeTheme.themeSource = darkThemes.includes(themeId) ? 'dark' : 'light';
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function cleanup() {
  if (sseClient) sseClient.disconnect();
  if (shortcutManager) shortcutManager.unregisterAll();
  if (trayManager) trayManager.destroy();
  if (pipManager) pipManager.destroy();
  if (devToolsManager) devToolsManager.destroy();
  if (windowManager) windowManager.closeAll();
}

// --- IPC Handlers ---

ipcMain.handle('get-game-state', () => {
  return cacheManager ? cacheManager.getGameState() : {};
});

ipcMain.handle('get-cached-turn', () => {
  return cacheManager ? cacheManager.getCachedTurnData() : {};
});

ipcMain.handle('queue-action', (event, action) => {
  if (!cacheManager) return 0;
  return cacheManager.queueAction(action);
});

ipcMain.handle('get-queue', () => {
  return cacheManager ? cacheManager.getQueuedActions() : [];
});

ipcMain.handle('get-theme', () => {
  return cacheManager ? cacheManager.getTheme() : 'default';
});

ipcMain.handle('set-theme', (event, themeId) => {
  if (cacheManager) {
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

ipcMain.handle('set-preference', (event, { key, value }) => {
  if (cacheManager) cacheManager.setPreference(key, value);

  if (key === 'notificationsEnabled' && notificationManager) {
    notificationManager.setEnabled(value);
  }
});

ipcMain.handle('update-game-state', (event, state) => {
  handleGameStateEvent({ data: state });
});

ipcMain.handle('open-window', (event, preset) => {
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

ipcMain.handle('set-admin', (event, isAdmin) => {
  if (menuManager) {
    menuManager.setAdmin(isAdmin);
  }
});

// --- App lifecycle ---

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  cleanup();
});
