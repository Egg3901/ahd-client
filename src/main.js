const { app, BrowserWindow, shell, session, nativeTheme, net, Menu } = require('electron');
const path = require('path');

// Allow Playwright E2E tests to connect on Windows (Electron 33).
// On Windows, Playwright cannot pass --remote-debugging-port as a CLI flag to Electron 33,
// and the -r preload loader.js cannot access the Electron app API.
// Instead, Playwright sets an env var, and we register the port and __playwright_run here.
if (process.env.PLAYWRIGHT_REMOTE_DEBUGGING_PORT) {
  app.commandLine.appendSwitch(
    'remote-debugging-port',
    process.env.PLAYWRIGHT_REMOTE_DEBUGGING_PORT,
  );
  // Provide the __playwright_run hook that Playwright calls via the Node debugger.
  // Since we cannot intercept app.whenReady() from the loader preload, we let the app
  // start normally and Playwright connects once the DevTools port is open.
  globalThis.__playwright_run = () => {};
}

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
  mainWindow.webContents.once('did-finish-load', async () => {
    const displayMode = cacheManager.getPreference('displayMode') || 'focused';
    await session.fromPartition('persist:ahd').cookies.set({
      url: config.GAME_URL,
      name: 'ahd-display-mode',
      value: displayMode,
      path: '/',
      sameSite: 'lax',
    });
    mainWindow.loadURL(config.GAME_URL);
  });

  // Mirror page title into window title bar
  mainWindow.webContents.on('page-title-updated', (_event, title) => {
    mainWindow.setTitle(`A House Divided \u2014 ${title}`);
  });

  // External links open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isGameUrl(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isGameUrl(url) && !url.startsWith('file://')) {
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

// --- Theme sync ---

/**
 * Push a theme change to the site via PATCH /api/settings/theme.
 * Uses cookies from the persist:ahd session for auth.
 * @param {string} themeId
 */
function pushThemeToSite(themeId) {
  session
    .fromPartition('persist:ahd')
    .cookies.get({ url: config.GAME_URL })
    .then((cookies) => {
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const body = JSON.stringify({ theme: themeId });
      const request = net.request({
        url: `${config.GAME_URL}/api/settings/theme`,
        method: 'PATCH',
      });
      request.setHeader('Cookie', cookieStr);
      request.setHeader('Content-Type', 'application/json');
      request.on('response', () => {});
      request.on('error', (err) => {
        console.error('Failed to push theme to site:', err.message);
      });
      request.write(body);
      request.end();
    })
    .catch((err) => {
      console.error('Failed to get cookies for theme push:', err.message);
    });
}

// --- Auth ---

/** @type {NodeJS.Timeout|null} */
let unreadPollTimer = null;

/**
 * Fetch the current user from GET /api/auth/me using session cookies.
 * Returns the user object or null if unauthenticated/error.
 * @returns {Promise<object|null>}
 */
function fetchAuthMe() {
  return new Promise((resolve) => {
    session
      .fromPartition('persist:ahd')
      .cookies.get({ url: config.GAME_URL })
      .then((cookies) => {
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        const req = net.request({
          url: `${config.GAME_URL}/api/auth/me`,
          method: 'GET',
        });
        req.setHeader('Cookie', cookieStr);
        req.setHeader('Accept', 'application/json');

        let body = '';
        req.on('response', (res) => {
          res.on('data', (chunk) => {
            body += chunk.toString();
          });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              resolve(data.user || null);
            } catch {
              resolve(null);
            }
          });
          res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.end();
      })
      .catch(() => resolve(null));
  });
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

  // Read site theme and inject MutationObserver after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    // Sync Electron theme from the site's data-theme attribute
    mainWindow.webContents
      .executeJavaScript(
        `document.documentElement.getAttribute('data-theme')`,
      )
      .then((siteTheme) => {
        if (siteTheme && siteTheme !== cacheManager.getTheme()) {
          cacheManager.setTheme(siteTheme);
          syncNativeTheme(siteTheme);
        }
      })
      .catch(() => {});

    // Watch for theme changes made on the site via MutationObserver
    mainWindow.webContents.executeJavaScript(`
      (() => {
        if (window.__ahdThemeObserver) return;
        window.__ahdThemeObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.attributeName === 'data-theme') {
              const theme = document.documentElement.getAttribute('data-theme');
              if (theme && window.ahdClient) {
                window.ahdClient.invoke('theme-changed-on-site', theme);
              }
            }
          }
        });
        window.__ahdThemeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme'],
        });
      })();
    `);

    // Fetch auth state and push to renderer
    fetchAuthMe().then((user) => {
      sendToRenderer('auth-state', { user });
    });
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

  // Feedback (#9)
  feedbackManager = new FeedbackManager(mainWindow);

  // Dev Tools (#10)
  devToolsManager = new DevToolsManager(mainWindow, sseClient);
  if (process.env.NODE_ENV === 'development') {
    devToolsManager.patchIpcMain();
  }
  sseClient.on('event', (event) => {
    if (devToolsManager) devToolsManager.logEvent(event);
  });

  // Menu (#5)
  menuManager = new MenuManager(mainWindow, windowManager, {
    isFocusedMode: (cacheManager.getPreference('displayMode') || 'focused') === 'focused',
    onThemeChange: (themeId) => {
      cacheManager.setTheme(themeId);
      syncNativeTheme(themeId);
      pushThemeToSite(themeId);
    },
    onTogglePip: () => pipManager.toggle(),
    onOpenFeedback: () => feedbackManager.openFeedbackDialog(),
    onToggleFocusedMode: (enabled) => {
      const mode = enabled ? 'focused' : 'classic';
      cacheManager.setPreference('displayMode', mode);
      session.fromPartition('persist:ahd').cookies.set({
        url: config.GAME_URL,
        name: 'ahd-display-mode',
        value: mode,
        path: '/',
        sameSite: 'lax',
      }).then(() => {
        mainWindow.loadURL(config.GAME_URL);
      });
      menuManager.setFocusedMode(enabled);
    },
  });
  if (process.env.NODE_ENV === 'development') {
    menuManager.onOpenEventLog = () => devToolsManager.openPanel();
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
    pushThemeToSite,
  });

  if (process.env.NODE_ENV === 'development') {
    devToolsManager.registerDevIpc(cacheManager);
  }

  // Route tracking, nav-state, and window title on navigation
  function onNavigate(_event, url) {
    try {
      const { pathname, search } = new URL(url);
      const path = pathname + search;
      sendToRenderer('route-changed', { path });
      sendNavState();
      mainWindow.setTitle(`A House Divided \u2014 ${getTitleForPath(pathname)}`);

      // Optimistically clear unread badge when user visits notifications
      if (pathname === '/notifications' && notificationManager) {
        notificationManager.clearUnread();
        sendToRenderer('unread-count', { count: 0 });
        if (trayManager) trayManager.updateMenu();
      }
    } catch {
      // url may be file:// during loading screen — ignore
    }
  }

  mainWindow.webContents.on('did-navigate', onNavigate);
  mainWindow.webContents.on('did-navigate-in-page', onNavigate);

  // Loading indicator
  mainWindow.webContents.on('did-start-loading', () => {
    sendToRenderer('loading-state', { loading: true });
  });
  mainWindow.webContents.on('did-stop-loading', () => {
    sendToRenderer('loading-state', { loading: false });
  });

  // Context menu (browser chrome is hidden in focused mode)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const items = [];

    if (params.isEditable) {
      items.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
      );
    } else if (params.selectionText) {
      items.push({ role: 'copy' }, { type: 'separator' });
    }

    items.push({
      label: 'Reload',
      click: () => mainWindow.loadURL(config.GAME_URL),
    });

    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  // Poll /api/auth/me every 60s for unread notification count
  sseClient.once('connected', () => {
    function pollUnreadCount() {
      fetchAuthMe().then((user) => {
        if (user) {
          sendToRenderer('unread-count', { count: user.unreadCount || 0 });
        }
      });
    }
    pollUnreadCount();
    unreadPollTimer = setInterval(pollUnreadCount, 60 * 1000);
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
    'turnsUntilElection',
    'actionPoints',
    'currentDate',
    'nextTurnIn',
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
 * @param {string} themeId - One of the site's theme IDs
 */
function syncNativeTheme(themeId) {
  const lightThemes = ['light', 'pastel', 'usa'];
  nativeTheme.themeSource = lightThemes.includes(themeId) ? 'light' : 'dark';
}

/**
 * Check whether a URL belongs to the game server.
 * Allows both www and non-www variants (e.g. the site redirects
 * https://ahousedividedgame.com → https://www.ahousedividedgame.com).
 * @param {string} url
 * @returns {boolean}
 */
function isGameUrl(url) {
  try {
    const gameHost = new URL(config.GAME_URL).hostname; // 'ahousedividedgame.com'
    const urlHost = new URL(url).hostname;
    return urlHost === gameHost || urlHost === `www.${gameHost}`;
  } catch {
    return false;
  }
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
 * Send current back/forward availability to the renderer.
 */
function sendNavState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const history = mainWindow.webContents.navigationHistory;
    sendToRenderer('nav-state', {
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    });
  }
}

/**
 * Map a URL pathname to a human-readable window title segment.
 * Uses the first path segment so /state/ohio → "State".
 * @param {string} pathname
 * @returns {string}
 */
function getTitleForPath(pathname) {
  const section = pathname.split('/').filter(Boolean)[0] || '';
  const titles = {
    '': 'Home',
    politician: 'My Politician',
    campaign: 'Campaign HQ',
    notifications: 'Notifications',
    achievements: 'Achievements',
    elections: 'Elections',
    legislature: 'Congress',
    bills: 'Legislature',
    state: 'State',
    country: 'Country',
    world: 'World',
    wiki: 'Game Wiki',
    roadmap: 'Roadmap',
    changelog: 'Changelog',
    admin: 'Admin',
    login: 'Login',
    register: 'Register',
    settings: 'Settings',
    feedback: 'Feedback',
    actions: 'Actions',
    profile: 'Profile',
  };
  return titles[section] || section || 'A House Divided';
}

/**
 * Tear down all modules. Called on window close and app quit.
 */
function cleanup() {
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer);
    unreadPollTimer = null;
  }
  if (sseClient) sseClient.disconnect();
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
