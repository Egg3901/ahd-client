const {
  app,
  BrowserWindow,
  shell,
  session,
  nativeTheme,
  net,
  Menu,
  clipboard,
} = require('electron');
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
const activeGameUrl = require('./active-game-url');
const { registerIpcHandlers } = require('./ipc');
const { getNavForCountry } = require('./nav');
const { getTitleForPath } = require('./title-for-path');

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
const ErrorHandler = require('./error-handler');
const ActionQueue = require('./action-queue');
const siteApi = require('./site-api');
const { normalizeClientNavManifest } = require('./nav-manifest');
const { openGamePanelConfigWindow } = require('./game-panel-config-window');
const { isLocalDevServerAllowed } = require('./game-server-dev');

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
/** @type {ErrorHandler|null} */
let errorHandler = null;
/** @type {ActionQueue|null} */
let actionQueue = null;

// --- Theme colours ---

/** Web-content background per theme (eliminates load-flash). */
const THEME_BACKGROUNDS = {
  default: '#0f0f1a',
  oled: '#000000',
  'dark-pastel': '#1a1527',
  light: '#f5f5f5',
  pastel: '#fdf4f0',
  usa: '#f0f0f5',
  solarized: '#002b36',
};

/** @type {object} Current country nav (defaults to US until manifest arrives) */
let currentNav = getNavForCountry(null);

/** Session name shared by the main window and pop-outs. */
const GAME_SESSION_PARTITION = 'persist:ahd';

/**
 * Avatar and asset CDNs often block or mishandle requests whose User-Agent
 * includes "Electron", which breaks GIF (and other) profile images.
 * Present as Chrome for this session; the app still exposes Electron via preload.
 */
function configureGamePartitionUserAgent() {
  const ses = session.fromPartition(GAME_SESSION_PARTITION);
  const ua = ses.getUserAgent();
  if (!/\sElectron\//.test(ua)) return;
  ses.setUserAgent(
    ua
      .replace(/\sElectron\/[\d.]+/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

// --- Window creation ---

/**
 * Create the main BrowserWindow, initialize all modules, and wire events.
 */
function createWindow() {
  cacheManager = new CacheManager();
  activeGameUrl.bindCache(cacheManager);
  errorHandler = new ErrorHandler();
  actionQueue = new ActionQueue(cacheManager);

  configureGamePartitionUserAgent();

  const savedTheme = cacheManager.getTheme();
  mainWindow = new BrowserWindow({
    width: config.WINDOW_WIDTH,
    height: config.WINDOW_HEIGHT,
    minWidth: config.MIN_WIDTH,
    minHeight: config.MIN_HEIGHT,
    title: 'A House Divided',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: THEME_BACKGROUNDS[savedTheme] ?? THEME_BACKGROUNDS.default,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: GAME_SESSION_PARTITION,
    },
    show: false,
  });

  // Show loading screen, then navigate to game server
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.once('did-finish-load', async () => {
    const displayMode = cacheManager.getPreference('displayMode') || 'focused';
    await session.fromPartition(GAME_SESSION_PARTITION).cookies.set({
      url: activeGameUrl.get(),
      name: 'ahd-display-mode',
      value: displayMode,
      path: '/',
      sameSite: 'lax',
    });
    // Session recovery: restore last page after crash (cleared on graceful quit)
    const lastURL = cacheManager.getPreference('lastURL');
    mainWindow.loadURL(
      lastURL && isGameUrl(lastURL) ? lastURL : activeGameUrl.get(),
    );
  });

  // Mirror page title into window title bar
  mainWindow.webContents.on('page-title-updated', (_event, title) => {
    mainWindow.setTitle(withServerLabel(`A House Divided \u2014 ${title}`));
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
  const resolved = resolveTheme(themeId);
  session
    .fromPartition(GAME_SESSION_PARTITION)
    .cookies.get({ url: activeGameUrl.get() })
    .then((cookies) => {
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const body = JSON.stringify({ theme: resolved });
      const request = net.request({
        url: `${activeGameUrl.get()}/api/settings/theme`,
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

// --- Client nav ---

/** @type {NodeJS.Timeout|null} */
let unreadPollTimer = null;

/**
 * Merge /api/character/me (corporation id) for World → My Corporation.
 * @param {object} manifest
 * @returns {Promise<object>}
 */
async function enrichClientNavManifest(manifest) {
  if (!manifest.hasCharacter) return manifest;
  try {
    const me = await siteApi.fetchCharacterMe(activeGameUrl.get());
    if (me?.corporation) {
      const corp = me.corporation;
      const isCeo =
        manifest.isCeo === true ||
        corp.isCeo === true ||
        corp.role === 'CEO' ||
        corp.role === 'ceo';
      const out = { ...manifest, isCeo };
      if (corp.sequentialId != null) {
        out.myCorporationId = corp.sequentialId;
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return manifest;
}

/**
 * Fetch the consolidated client-nav manifest from /api/client-nav.
 * @returns {Promise<object|null>}
 */
function fetchClientNav() {
  return siteApi.fetchClientNav(activeGameUrl.get());
}

/**
 * Apply country-specific nav config to menus and window presets.
 * @param {string|null} countryId
 * @param {object} manifest
 */
function applyNavForCountry(countryId, manifest) {
  currentNav = getNavForCountry(countryId);
  if (menuManager) menuManager.setNavConfig(currentNav, manifest);
  if (windowManager) windowManager.updatePresets(currentNav);
}

/**
 * Apply client-nav side effects (IPC to renderer, menus, game-state hydration).
 * @param {object} manifest
 */
function applyClientNavEffects(manifest) {
  sendToRenderer('auth-state', {
    user: manifest.user,
    hasCharacter: manifest.hasCharacter,
    missingDemographics: manifest.missingDemographics,
  });
  sendToRenderer('client-nav', manifest);
  sendToRenderer('nav-data-updated', manifest);
  sendToRenderer('unread-count', { count: manifest.unreadCount || 0 });
  sendToRenderer('unread-mail-count', { count: manifest.unreadMailCount || 0 });
  if (menuManager) menuManager.setAdmin(manifest.user?.isAdmin ?? false);
  applyNavForCountry(manifest.characterCountryId, manifest);

  // Hydrate game state from client-nav financial fields so PiP, tray,
  // and cache stay current even before the dashboard poller runs.
  const navState = {};
  if (manifest.funds != null) navState.funds = manifest.funds;
  if (manifest.actions != null) navState.actionPoints = manifest.actions;
  if (manifest.cashOnHand != null) navState.cashOnHand = manifest.cashOnHand;
  if (manifest.portfolioValue != null)
    navState.portfolioValue = manifest.portfolioValue;
  if (manifest.portfolioChangePercent != null)
    navState.portfolioChangePercent = manifest.portfolioChangePercent;
  if (manifest.cashOnHandChangePercent != null)
    navState.cashOnHandChangePercent = manifest.cashOnHandChangePercent;
  if (manifest.projectedIncome != null)
    navState.projectedIncome = manifest.projectedIncome;
  if (manifest.unreadMailCount != null)
    navState.unreadMailCount = manifest.unreadMailCount;
  if (Object.keys(navState).length > 0) {
    handleGameStateEvent({ data: navState });
  }
}

/**
 * Handle a fresh client-nav manifest: enrich, then apply.
 * @param {object|null} manifest
 */
function handleClientNav(manifest) {
  if (!manifest) return;
  const normalized = normalizeClientNavManifest(manifest);
  enrichClientNavManifest(normalized)
    .then((data) => applyClientNavEffects(data))
    .catch(() => applyClientNavEffects(normalized));
}

// --- Theme observer ---

/**
 * (Re-)inject the MutationObserver that watches for site-side theme changes.
 * Disconnects any existing observer before creating a new one, so it is safe
 * to call on every navigation (both full and in-page).
 */
function reinitializeThemeObserver() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      `
      (() => {
        if (window.__ahdThemeObserver) {
          window.__ahdThemeObserver.disconnect();
        }
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
    `,
    )
    .catch(() => {});
}

// --- Client-nav polling ---

/**
 * (Re-)start the client-nav poll timer at the given interval.
 * Clears any existing timer first.
 * @param {number} intervalMs
 */
function startClientNavPolling(intervalMs) {
  if (unreadPollTimer) clearInterval(unreadPollTimer);
  unreadPollTimer = setInterval(
    () => fetchClientNav().then(handleClientNav),
    intervalMs,
  );
}

/** 30s while focused, 60s when unfocused (reduces background churn). */
function scheduleClientNavPollInterval() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const ms = mainWindow.isFocused() ? 30 * 1000 : 60 * 1000;
  startClientNavPolling(ms);
}

// --- Module initialization ---

/**
 * Instantiate all feature modules and wire their cross-cutting events.
 * Called once after the main window is created.
 */
function initModules() {
  /**
   * Sync focused vs classic display mode (cookie + reload) for NavbarWrapper.
   * @param {boolean} enabled - true = focused (site navbar hidden)
   */
  function toggleFocusedMode(enabled) {
    const mode = enabled ? 'focused' : 'classic';
    cacheManager.setPreference('displayMode', mode);
    session
      .fromPartition(GAME_SESSION_PARTITION)
      .cookies.set({
        url: activeGameUrl.get(),
        name: 'ahd-display-mode',
        value: mode,
        path: '/',
        sameSite: 'lax',
      })
      .then(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(activeGameUrl.get());
        }
      });
    if (menuManager) menuManager.setFocusedMode(enabled);
    sendToRenderer('toggle-focused-view', enabled);
  }

  mainWindow.on('focus', () => scheduleClientNavPollInterval());
  mainWindow.on('blur', () => scheduleClientNavPollInterval());

  // SSE Client (#1)
  sseClient = new SSEClient();
  mainWindow.webContents.on('did-navigate', () => {
    session
      .fromPartition(GAME_SESSION_PARTITION)
      .cookies.get({ url: activeGameUrl.get() })
      .then((cookies) => {
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        sseClient.setCookie(cookieStr);
        if (!sseClient.isConnected()) sseClient.connect();
      })
      .catch(() => {});
  });

  // Reinitialize the theme MutationObserver on every navigation so it
  // always tracks the live document, even after full-page navigations.
  mainWindow.webContents.on('did-navigate', reinitializeThemeObserver);

  // Read site theme, reinitialize observer, and refresh client-nav after
  // each page finishes loading.
  mainWindow.webContents.on('did-finish-load', () => {
    // Sync Electron theme from the site's data-theme attribute
    mainWindow.webContents
      .executeJavaScript(`document.documentElement.getAttribute('data-theme')`)
      .then((siteTheme) => {
        if (siteTheme && siteTheme !== cacheManager.getTheme()) {
          cacheManager.setTheme(siteTheme);
          syncNativeTheme(siteTheme);
        }
      })
      .catch(() => {});

    // Ensure the observer is active in the freshly loaded page context
    reinitializeThemeObserver();

    // Fetch client-nav manifest and apply
    fetchClientNav().then(handleClientNav);
  });

  // Notifications (#1)
  notificationManager = new NotificationManager(mainWindow, (route) => {
    mainWindow.loadURL(`${activeGameUrl.get()}${route}`);
  });
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
  windowManager = new WindowManager(cacheManager);

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
  shortcutManager.onCustom('toggleFocusedView', () => {
    const focused =
      (cacheManager.getPreference('displayMode') || 'focused') === 'focused';
    toggleFocusedMode(!focused);
  });
  shortcutManager.onCustom('openCommandPalette', () => {
    injectCommandPalette(currentNav);
  });
  shortcutManager.registerAll();

  // PiP (#8)
  pipManager = new PipManager(mainWindow, cacheManager);

  // Dashboard poller (#11) — polls /api/game/turn/dashboard and feeds
  // the rich response into the same handleGameStateEvent pipeline so tray,
  // pip, and cache all stay in sync from a single source of truth.
  dashboardPoller = new DashboardPoller();
  dashboardPoller.start((mapped) => handleGameStateEvent({ data: mapped }));
  sseClient.on('connected', () => {
    if (dashboardPoller) dashboardPoller.poll();
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
  if (process.env.NODE_ENV === 'development') {
    devToolsManager.patchIpcMain();
  }
  sseClient.on('event', (event) => {
    if (devToolsManager) devToolsManager.logEvent(event);
  });

  // Menu (#5)
  menuManager = new MenuManager(mainWindow, windowManager, {
    cacheManager,
    isFocusedMode:
      (cacheManager.getPreference('displayMode') || 'focused') === 'focused',
    onThemeChange: (themeId) => {
      cacheManager.setTheme(themeId);
      syncNativeTheme(themeId);
      pushThemeToSite(themeId);
    },
    onTogglePip: () => pipManager.toggle(),
    onOpenFeedback: () => feedbackManager.openFeedbackDialog(),
    onToggleFocusedMode: (enabled) => toggleFocusedMode(enabled),
    onOpenGamePanelConfig: () =>
      openGamePanelConfigWindow({ parent: mainWindow }),
    gameServer: {
      get envOverride() {
        return config.isEnvGameUrlOverride();
      },
      get showDevToggle() {
        return isLocalDevServerAllowed(menuManager?.isAdmin === true);
      },
      get useDevServer() {
        return cacheManager.getPreference('useDevServer') === true;
      },
      get useSandbox() {
        return cacheManager.getPreference('useSandboxServer') === true;
      },
      onSwitchDev(useDev) {
        cacheManager.setPreference('useDevServer', useDev);
        if (useDev) cacheManager.setPreference('useSandboxServer', false);
        if (sseClient) sseClient.disconnect();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(activeGameUrl.get());
        }
        if (menuManager) menuManager.build();
      },
      onSwitch(useSandbox) {
        cacheManager.setPreference('useSandboxServer', useSandbox);
        if (useSandbox) cacheManager.setPreference('useDevServer', false);
        if (sseClient) sseClient.disconnect();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(activeGameUrl.get());
        }
        if (menuManager) menuManager.build();
      },
      /** Main production URL — clears sandbox and dev-server preferences. */
      onUseStandardServer() {
        const dev = cacheManager.getPreference('useDevServer') === true;
        const sb = cacheManager.getPreference('useSandboxServer') === true;
        if (!dev && !sb) return;
        cacheManager.setPreference('useDevServer', false);
        cacheManager.setPreference('useSandboxServer', false);
        if (sseClient) sseClient.disconnect();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(activeGameUrl.get());
        }
        if (menuManager) menuManager.build();
      },
    },
  });
  if (process.env.NODE_ENV === 'development') {
    menuManager.onOpenEventLog = () => devToolsManager.openPanel();
  }
  activeGameUrl.setAdminProvider(() => menuManager?.isAdmin === true);
  menuManager.build();

  if (trayManager) {
    trayManager.setFocusedViewToggleHandler(() => {
      const focused =
        (cacheManager.getPreference('displayMode') || 'focused') === 'focused';
      toggleFocusedMode(!focused);
    });
  }

  // Auto-updater (#7)
  updateManager = new UpdateManager(mainWindow);
  updateManager.onUpdateAvailable = () => {
    if (trayManager) trayManager.setUpdateAvailable(true);
  };
  updateManager.onUpdateReady = () => {
    if (trayManager) trayManager.setUpdateReady(true);
  };
  setTimeout(() => updateManager.checkForUpdates(), 10000);

  // SSE -> game state propagation (#2, #6, #8)
  sseClient.on('event', (event) => handleGameStateEvent(event));
  sseClient.on('turn_complete', (data) => cacheManager.cacheTurnData(data));

  // SSE theme_changed — sync native theme when the site theme is changed
  // from another session or device (SSE is unreliable cross-instance, so
  // the MutationObserver remains the primary mechanism; this is a supplement).
  sseClient.on('theme_changed', (data) => {
    const theme = data?.payload?.theme ?? data?.theme;
    if (theme && cacheManager && theme !== cacheManager.getTheme()) {
      cacheManager.setTheme(theme);
      syncNativeTheme(theme);
    }
  });

  // OS dark mode changed — re-sync background/themeSource when using 'auto'
  nativeTheme.on('updated', () => {
    if (cacheManager && cacheManager.getTheme() === 'auto') {
      syncNativeTheme('auto');
    }
  });

  // SSE connection status -> renderer
  sseClient.on('connected', () => {
    console.log('SSE connected');
    sendToRenderer('sse-status', { connected: true });
    // Flush queued actions to renderer for replay (with retry tracking)
    actionQueue.flush(sendToRenderer);
    broadcastQueueStatus();
    scheduleClientNavPollInterval();
  });

  // Re-flush after a retry delay when the renderer reported a failure and
  // the action still has attempts remaining.
  actionQueue.on('retry-ready', () => {
    if (sseClient && sseClient.isConnected()) {
      actionQueue.flush(sendToRenderer);
    }
  });

  // Notify renderer when an action has exhausted all retries
  actionQueue.on('action-failed', (action) => {
    sendToRenderer('action-failed', {
      id: action.id,
      type: action.type,
      error: action.lastError,
    });
    broadcastQueueStatus();
  });
  sseClient.on('disconnected', () => {
    console.log('SSE disconnected');
    sendToRenderer('sse-status', { connected: false });
    scheduleClientNavPollInterval();
  });
  sseClient.on('reconnecting', ({ delay, attempt }) => {
    console.log(`SSE reconnecting in ${delay}ms (attempt ${attempt})`);
    sendToRenderer('sse-status', { connected: false, reconnecting: true });
  });

  // IPC handlers (extracted to src/ipc.js for modularity)
  registerIpcHandlers({
    cacheManager,
    actionQueue,
    notificationManager,
    menuManager,
    windowManager,
    pipManager,
    feedbackManager,
    updateManager,
    sseClient,
    shortcutManager,
    mainWindow,
    syncNativeTheme,
    handleGameStateEvent,
    pushThemeToSite,
    fetchClientNav,
    enrichClientNavManifest,
    isGameUrl,
    broadcastQueueStatus,
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
      mainWindow.setTitle(withServerLabel(getTitleForPath(pathname, currentNav)));
      // Persist last URL for session recovery after crash
      if (isGameUrl(url)) cacheManager.setPreference('lastURL', url);

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

  // 404 recovery overlay
  mainWindow.webContents.on(
    'did-navigate',
    (_event, _url, httpResponseCode, _statusText, isMainFrame) => {
      if (isMainFrame && httpResponseCode === 404) {
        injectErrorOverlay('not-found');
      }
    },
  );

  // Network failure overlay
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, _errorDescription, _validatedURL, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) {
        injectErrorOverlay('connection');
      }
    },
  );

  // Dismiss overlay when a new load starts
  mainWindow.webContents.on('did-start-loading', dismissErrorOverlay);

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
      click: () => mainWindow.loadURL(activeGameUrl.get()),
    });

    items.push({ type: 'separator' });
    items.push({
      label: 'Copy Page URL',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          clipboard.writeText(mainWindow.webContents.getURL());
        }
      },
    });

    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  // On first SSE connection: do an immediate client-nav fetch and load
  // the error code catalog. Ongoing polling is managed by startClientNavPolling
  // via the connected/disconnected handlers above.
  sseClient.once('connected', () => {
    fetchClientNav().then(handleClientNav);
    if (errorHandler) errorHandler.loadErrorCodes();
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
    'cashOnHand',
    'portfolioValue',
    'portfolioChangePercent',
    'cashOnHandChangePercent',
    'projectedIncome',
    'incomeBreakdown',
    // Unread mail (from client-nav hydration)
    'unreadMailCount',
    // Decay stats
    'politicalInfluence',
    'politicalInfluenceDecayWarning',
    'politicalInfluenceProjected',
    'politicalInfluenceDecaying',
    'favorability',
    'favorabilityDecayWarning',
    'favorabilityProjected',
    'favorabilityDecaying',
    'infamy',
    'infamyDecayWarning',
    'infamyProjected',
    'infamyDecayAmount',
    'nationalInfluence',
    'hasCorp',
    // Election countdown
    'electionDate',
    'electionName',
    'electionIsCandidate',
    // Per-action AP costs
    'actionCosts',
  ];
  const gameState = {};
  for (const field of fields) {
    if (data[field] !== undefined) gameState[field] = data[field];
  }

  if (Object.keys(gameState).length > 0) {
    if (trayManager) trayManager.updateGameState(gameState);
    if (pipManager) pipManager.updateBarState(gameState);
    cacheManager.updateGameState(gameState);
  }

  if (data.nextTurnIn !== undefined) {
    checkTurnAlert(data.nextTurnIn);
  }
}

/**
 * Return a bracketed server label for non-standard servers, or '' for main.
 * @returns {string} e.g. '[Sandbox]', '[Dev]', '[Custom]', or ''
 */
function getServerLabel() {
  if (config.ENV_GAME_URL) return '[Custom]';
  if (cacheManager && cacheManager.getPreference('useDevServer') === true)
    return '[Dev]';
  if (cacheManager && cacheManager.getPreference('useSandboxServer') === true)
    return '[Sandbox]';
  return '';
}

/**
 * Prefix a window title with the active server label when not on main.
 * @param {string} title
 * @returns {string}
 */
function withServerLabel(title) {
  const label = getServerLabel();
  return label ? `${label} ${title}` : title;
}

/**
 * Resolve 'auto' to a concrete theme ID based on current OS dark mode state.
 * All other IDs pass through unchanged.
 * @param {string} themeId
 * @returns {string}
 */
function resolveTheme(themeId) {
  if (themeId !== 'auto') return themeId;
  return nativeTheme.shouldUseDarkColors ? 'default' : 'light';
}

/**
 * Map a theme ID to Electron's nativeTheme.themeSource, update the titlebar
 * overlay colour (Windows), and set the window background colour.
 * @param {string} themeId - One of the site's theme IDs (may be 'auto')
 */
function syncNativeTheme(themeId) {
  if (themeId === 'auto') {
    nativeTheme.themeSource = 'system';
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bg = nativeTheme.shouldUseDarkColors
        ? THEME_BACKGROUNDS.default
        : THEME_BACKGROUNDS.light;
      mainWindow.setBackgroundColor(bg);
    }
    return;
  }
  const lightThemes = ['light', 'pastel', 'usa'];
  nativeTheme.themeSource = lightThemes.includes(themeId) ? 'light' : 'dark';
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bg = THEME_BACKGROUNDS[themeId] ?? THEME_BACKGROUNDS.default;
    mainWindow.setBackgroundColor(bg);
  }
}

/**
 * Check whether a URL belongs to the game server.
 * Allows both www and non-www variants (e.g. the site redirects
 * https://ahousedividedgame.com → https://www.ahousedividedgame.com).
 * @param {string} url
 * @returns {boolean}
 */
function isGameUrl(url) {
  return config.isTrustedGameUrl(url);
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
 * Inject a recovery overlay into the main window.
 * @param {'not-found'|'connection'} type
 */
function injectErrorOverlay(type) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const message = errorHandler
    ? errorHandler.getOverlayMessage(type)
    : type === 'connection'
      ? "Couldn't connect — check your internet connection"
      : "This page isn't available yet";
  mainWindow.webContents
    .executeJavaScript(
      `(function() {
        if (document.getElementById('ahd-error-overlay')) return;
        const el = document.createElement('div');
        el.id = 'ahd-error-overlay';
        Object.assign(el.style, {
          position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
          background: '#0f0f1a', color: '#e0e0e0', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: '999999', fontFamily: 'system-ui, sans-serif', gap: '16px',
        });
        el.innerHTML = \`
          <p style="font-size:1.1rem;margin:0">${message}</p>
          <div style="display:flex;gap:12px">
            <button onclick="window.history.back()"
              style="padding:8px 20px;cursor:pointer;border-radius:6px;border:1px solid #444;background:#1a1a2e;color:#e0e0e0">
              Go Back
            </button>
            <button onclick="window.ahdClient&&window.ahdClient.invoke('go-home')"
              style="padding:8px 20px;cursor:pointer;border-radius:6px;border:none;background:#4a6fa5;color:#fff">
              Go Home
            </button>
          </div>
        \`;
        document.body.appendChild(el);
      })();`,
    )
    .catch(() => {});
}

function dismissErrorOverlay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      `(function() { const el = document.getElementById('ahd-error-overlay'); if (el) el.remove(); })();`,
    )
    .catch(() => {});
}

/**
 * Inject the Cmd+K command palette overlay into the renderer.
 * @param {object|null} currentNav - The current navigation config
 */
function injectCommandPalette(currentNav) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Build route list from currentNav + static routes
  const staticRoutes = [
    { label: 'Notifications', route: '/notifications' },
    { label: 'Campaign HQ', route: '/campaign' },
    { label: 'Fundraise', route: '/campaign/fundraise' },
    { label: 'Advertise', route: '/campaign/advertise' },
    { label: 'Poll', route: '/poll' },
    { label: 'Profile', route: '/profile' },
    { label: 'Settings', route: '/settings' },
  ];

  const navRoutes = [];
  if (currentNav?.executive) navRoutes.push({ label: 'Executive', route: currentNav.executive });
  if (currentNav?.legislature) navRoutes.push({ label: 'Legislature', route: currentNav.legislature });
  if (currentNav?.elections) navRoutes.push({ label: 'Elections', route: currentNav.elections });
  if (currentNav?.map) navRoutes.push({ label: 'Map', route: currentNav.map });
  if (currentNav?.whiteHouse) navRoutes.push({ label: 'White House', route: currentNav.whiteHouse });
  if (currentNav?.congress) navRoutes.push({ label: 'Congress', route: currentNav.congress });

  const allRoutes = [...navRoutes, ...staticRoutes];
  const routesJson = JSON.stringify(allRoutes);

  const script = `
    (function() {
      // Remove existing palette if present
      const existing = document.getElementById('cmdk-palette');
      if (existing) existing.remove();

      const routes = ${routesJson};

      const container = document.createElement('div');
      container.id = 'cmdk-palette';
      container.innerHTML = \`
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); z-index: 999997; display: flex; align-items: flex-start; justify-content: center; padding-top: 100px;">
          <div style="background: var(--theme-bg, #1a1a1a); border: 1px solid var(--theme-border, #333); border-radius: 8px; width: 500px; max-height: 400px; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
            <input type="text" id="cmdk-input" placeholder="Type to search..." style="width: 100%; padding: 12px; border: none; border-bottom: 1px solid var(--theme-border, #333); background: transparent; color: var(--theme-text, #fff); font-size: 14px; outline: none;" />
            <div id="cmdk-results" style="overflow-y: auto; flex: 1; padding: 8px 0;"></div>
          </div>
        </div>
      \`;
      document.body.appendChild(container);

      const input = document.getElementById('cmdk-input');
      const results = document.getElementById('cmdk-results');
      let selectedIndex = -1;
      let filtered = routes;

      function render() {
        results.innerHTML = filtered.slice(0, 8).map((r, i) =>
          \`<div style="padding: 8px 12px; cursor: pointer; background: \${i === selectedIndex ? 'var(--theme-accent, #3b82f6)' : 'transparent'}; color: \${i === selectedIndex ? '#fff' : 'var(--theme-text, #fff)'};" data-index="\${i}" data-route="\${r.route}">\${r.label}</div>\`
        ).join('');
      }

      input.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        filtered = routes.filter(r => r.label.toLowerCase().includes(q) || r.route.toLowerCase().includes(q));
        selectedIndex = filtered.length > 0 ? 0 : -1;
        render();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
          render();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, 0);
          render();
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
          window.ahdClient.invoke('navigate', filtered[selectedIndex].route);
          container.remove();
        } else if (e.key === 'Escape') {
          container.remove();
        }
      });

      results.addEventListener('click', (e) => {
        const item = e.target.closest('[data-route]');
        if (item) {
          window.ahdClient.invoke('navigate', item.dataset.route);
          container.remove();
        }
      });

      container.addEventListener('click', (e) => {
        if (e.target === container) container.remove();
      });

      input.focus();
    })();
  `;

  mainWindow.webContents.executeJavaScript(script);
}

/**
 * Inject or update the offline action queue banner at the top of the window.
 * @param {number} count
 */
function injectQueueBanner(count) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const text = `\u23f3 ${count} action${count === 1 ? '' : 's'} queued \u2014 reconnecting\u2026`;
  mainWindow.webContents
    .executeJavaScript(
      `(function() {
        let el = document.getElementById('ahd-queue-banner');
        if (!el) {
          el = document.createElement('div');
          el.id = 'ahd-queue-banner';
          Object.assign(el.style, {
            position: 'fixed', top: '0', left: '0', width: '100%',
            background: '#2a1f00', color: '#ffcc44',
            padding: '6px 16px', zIndex: '999998',
            fontFamily: 'system-ui, sans-serif', fontSize: '13px',
            textAlign: 'center', boxSizing: 'border-box',
          });
          document.body.appendChild(el);
        }
        el.textContent = ${JSON.stringify(text)};
      })();`,
    )
    .catch(() => {});
}

function dismissQueueBanner() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      `(function() { const el = document.getElementById('ahd-queue-banner'); if (el) el.remove(); })();`,
    )
    .catch(() => {});
}

/**
 * Sync pending queue count to the native banner and tray.
 * Call this whenever the queue changes (add, result, flush).
 */
function broadcastQueueStatus() {
  const count = actionQueue ? actionQueue.getPending().length : 0;
  if (count > 0) {
    injectQueueBanner(count);
  } else {
    dismissQueueBanner();
  }
  if (trayManager) trayManager.setQueueCount(count);
}

// --- Turn alert ---

/** Prevents re-firing the audio alert within the same turn countdown window. */
let _turnAlertFired = false;

/**
 * Beep once when ≤60 seconds remain until the next turn (if alert is enabled).
 * Resets automatically when the turn countdown resets.
 * @param {number} nextTurnIn - Seconds until next turn
 */
function checkTurnAlert(nextTurnIn) {
  if (!cacheManager || cacheManager.getPreference('turnAlertEnabled') === false) return;
  if (typeof nextTurnIn !== 'number') { _turnAlertFired = false; return; }
  if (nextTurnIn > 60 || nextTurnIn <= 0) { _turnAlertFired = false; return; }
  if (_turnAlertFired) return;
  _turnAlertFired = true;
  shell.beep();
}

/**
 * Tear down all modules. Called on window close and app quit.
 */
function cleanup() {
  // Clear session recovery URL — only restore after a crash, not a clean quit
  if (cacheManager) cacheManager.setPreference('lastURL', null);
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer);
    unreadPollTimer = null;
  }
  if (sseClient) sseClient.disconnect();
  if (actionQueue) actionQueue.destroy();
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
