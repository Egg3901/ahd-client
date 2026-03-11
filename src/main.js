const { app, BrowserWindow, shell, session, nativeTheme } = require('electron');
const path = require('path');
const config = require('./config');
const { registerIpcHandlers } = require('./ipc');

// Module classes
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
const DashboardPoller = require('./dashboard');

// --- Module singletons (initialized in createWindow) ---

/** @type {Electron.BrowserWindow|null} */
let mainWindow = null;
/** @type {SSEClient|null} */
let sseClient = null;
/** @type {NotificationManager|null} */
let notificationManager = null;
/** @type {TrayManager|null} */
let trayManager = null;
/** @type {WindowManager|null} */
let windowManager = null;
/** @type {ShortcutManager|null} */
let shortcutManager = null;
/** @type {MenuManager|null} */
let menuManager = null;
/** @type {CacheManager|null} */
let cacheManager = null;
/** @type {UpdateManager|null} */
let updateManager = null;
/** @type {PipManager|null} */
let pipManager = null;
/** @type {FeedbackManager|null} */
let feedbackManager = null;
/** @type {DevToolsManager|null} */
let devToolsManager = null;
/** @type {DashboardPoller|null} */
let dashboardPoller = null;

// --- Window creation ---

/**
 * Create the main BrowserWindow, initialize all modules, and wire events.
 */
function createWindow() {
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

  // Show loading screen, then navigate to game server
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.loadURL(config.GAME_URL);
  });

  // Mirror page title into window title bar
  mainWindow.webContents.on('page-title-updated', (_event, title) => {
    mainWindow.setTitle(`A House Divided \u2014 ${title}`);
  });

  // External links open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(config.GAME_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

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
  syncNativeTheme(cacheManager.getTheme());

  // Clear unread badge when user returns to the window
  mainWindow.on('focus', () => {
    if (notificationManager) notificationManager.clearUnread();
    if (trayManager) trayManager.updateMenu();
  });

  initModules();
}

// --- Module initialization ---

/**
 * Instantiate all feature modules and wire their cross-cutting events.
 * Called once after the main window is created.
 */
function initModules() {
  // SSE Client (#1)
  sseClient = new SSEClient();
  mainWindow.webContents.on('did-navigate', () => {
    session
      .fromPartition('persist:ahd')
      .cookies.get({ url: config.GAME_URL })
      .then((cookies) => {
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        sseClient.setCookie(cookieStr);
        if (!sseClient.isConnected()) sseClient.connect();
      })
      .catch(() => {});
  });

  // Notifications (#1)
  notificationManager = new NotificationManager(mainWindow);
  notificationManager.setEnabled(
    cacheManager.getPreference('notificationsEnabled') !== false,
  );

  sseClient.on('event', (event) => {
    notificationManager.handleSSEEvent(event);
    if (trayManager) trayManager.updateMenu();
  });

  // Tray (#2)
  trayManager = new TrayManager(mainWindow, notificationManager);
  trayManager.create();
  const cachedState = cacheManager.getGameState();
  if (cachedState.turnsUntilElection) {
    trayManager.updateGameState(cachedState);
  }

  // Window Manager (#3)
  windowManager = new WindowManager();

  // Shortcuts (#4)
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

  // PiP (#8)
  pipManager = new PipManager(mainWindow);

  // Dashboard poller (#11) — polls /api/game/turn/dashboard and feeds
  // the rich response into the same handleGameStateEvent pipeline so tray,
  // pip, and cache all stay in sync from a single source of truth.
  dashboardPoller = new DashboardPoller();
  // Start polling once SSE is connected (session cookies are ready)
  sseClient.once('connected', () => {
    dashboardPoller.start((mapped) =>
      handleGameStateEvent({ data: mapped }),
    );
  });
  // Re-poll immediately after any event that changes character state
  const REPOLL_EVENTS = [
    'turn_complete',
    'action_points_refreshed',
    'campaign_update',
    'election_resolved',
    'bill_enacted',
  ];
  sseClient.on('event', ({ type }) => {
    if (REPOLL_EVENTS.includes(type) && dashboardPoller) {
      dashboardPoller.poll();
    }
  });

  // Feedback (#9)
  feedbackManager = new FeedbackManager(mainWindow);

  // Dev Tools (#10)
  devToolsManager = new DevToolsManager(mainWindow, sseClient);
  sseClient.on('event', (event) => {
    if (devToolsManager) devToolsManager.logEvent(event);
  });

  // Menu (#5)
  menuManager = new MenuManager(mainWindow, windowManager, {
    onThemeChange: (themeId) => {
      cacheManager.setTheme(themeId);
      syncNativeTheme(themeId);
    },
    onTogglePip: () => pipManager.toggle(),
    onOpenFeedback: () => feedbackManager.openFeedbackDialog(),
  });
  if (process.env.NODE_ENV === 'development') {
    menuManager.onOpenEventLog = () => devToolsManager.openEventLog();
  }
  menuManager.build();

  // Auto-updater (#7)
  updateManager = new UpdateManager(mainWindow);
  setTimeout(() => updateManager.checkForUpdates(), 10000);

  // SSE -> game state propagation (#2, #6, #8)
  sseClient.on('event', (event) => handleGameStateEvent(event));
  sseClient.on('turn_complete', (data) => cacheManager.cacheTurnData(data));

  // SSE connection status -> renderer
  sseClient.on('connected', () => {
    console.log('SSE connected');
    sendToRenderer('sse-status', { connected: true });
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

  // IPC handlers (extracted to src/ipc.js for modularity)
  registerIpcHandlers({
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
  });
}

// --- Helpers ---

/**
 * Extract recognized game state fields from an SSE event and propagate
 * to tray, PiP, and the persistent cache.
 * @param {{data: object}} event
 */
function handleGameStateEvent(event) {
  const data = event.data || {};
  const fields = [
    // Core (original)
    'turnsUntilElection',
    'actionPoints',
    'maxActionPoints',
    'currentDate',
    'nextTurnIn',
    // Funds & income
    'funds',
    'projectedIncome',
    'incomeBreakdown',
    // Decay stats
    'politicalInfluence',
    'politicalInfluenceDecayWarning',
    'favorability',
    'favorabilityDecayWarning',
    'infamy',
    'infamyDecayWarning',
    // Election countdown
    'electionDate',
    'electionName',
    // Per-action AP costs
    'actionCosts',
  ];
  const gameState = {};
  for (const field of fields) {
    if (data[field] !== undefined) gameState[field] = data[field];
  }

  if (Object.keys(gameState).length > 0) {
    if (trayManager) trayManager.updateGameState(gameState);
    if (pipManager) pipManager.updateGameState(gameState);
    cacheManager.updateGameState(gameState);
  }
}

/**
 * Map a theme ID to Electron's nativeTheme.themeSource.
 * @param {string} themeId - One of the 7 game theme IDs
 */
function syncNativeTheme(themeId) {
  const darkThemes = ['default', 'dark', 'gilded', 'federal'];
  nativeTheme.themeSource = darkThemes.includes(themeId) ? 'dark' : 'light';
}

/**
 * Safely send a message to the renderer process.
 * @param {string} channel
 * @param {*} data
 */
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Tear down all modules. Called on window close and app quit.
 */
function cleanup() {
  if (sseClient) sseClient.disconnect();
  if (dashboardPoller) dashboardPoller.stop();
  if (shortcutManager) shortcutManager.unregisterAll();
  if (trayManager) trayManager.destroy();
  if (pipManager) pipManager.destroy();
  if (devToolsManager) devToolsManager.destroy();
  if (windowManager) windowManager.closeAll();
}

// --- App lifecycle ---

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('will-quit', () => cleanup());
