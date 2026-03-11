const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

/**
 * Developer tooling — unified devtools panel, SSE event log,
 * IPC call interceptor, server switcher, and state inspector.
 *
 * All public surface lives in NODE_ENV=development only;
 * production builds instantiate this class but call none of its
 * dev-only methods (patchIpcMain / registerDevIpc / openPanel).
 */

const SERVER_PRESETS = {
  local: 'http://localhost:3000',
  staging: 'https://staging.ahousedividedgame.com',
  production: 'https://ahousedividedgame.com',
};

class DevToolsManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow
   * @param {import('./sse')} sseClient
   */
  constructor(mainWindow, sseClient) {
    /** @type {Electron.BrowserWindow} */
    this.mainWindow = mainWindow;
    /** @type {import('./sse')} */
    this.sseClient = sseClient;
    /** @type {Electron.BrowserWindow|null} */
    this.panelWindow = null;

    /** @type {Array<{timestamp:string, type:string, data:*}>} */
    this.eventLog = [];
    /** @type {number} */
    this.maxLogEntries = 500;

    /** @type {Array<{channel:string, args:*, result:*, error:string|undefined, durationMs:number, timestamp:string}>} */
    this.ipcLog = [];
    /** @type {number} */
    this.maxIpcEntries = 200;
  }

  // ---------------------------------------------------------------------------
  // IPC interceptor — call before registerIpcHandlers
  // ---------------------------------------------------------------------------

  /**
   * Monkey-patch ipcMain.handle so every handler invocation is logged.
   * dev-* channels are excluded to prevent recursion.
   * Must be called BEFORE registerIpcHandlers.
   */
  patchIpcMain() {
    const self = this;
    const original = ipcMain.handle.bind(ipcMain);

    ipcMain.handle = function (channel, handler) {
      if (channel.startsWith('dev-')) {
        return original(channel, handler);
      }
      return original(channel, async (event, ...args) => {
        const start = Date.now();
        let result;
        let errorMsg;
        try {
          result = await handler(event, ...args);
          return result;
        } catch (err) {
          errorMsg = err.message || String(err);
          throw err;
        } finally {
          self._logIpcCall({
            channel,
            args: args.length ? args : undefined,
            result: errorMsg ? undefined : result,
            error: errorMsg,
            durationMs: Date.now() - start,
            timestamp: new Date().toISOString(),
          });
        }
      });
    };
  }

  // ---------------------------------------------------------------------------
  // SSE event logging
  // ---------------------------------------------------------------------------

  /**
   * Record an SSE event and push it live to the panel if open.
   * @param {{type:string, data:*}} event
   */
  logEvent(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: event.type,
      data: event.data,
    };
    this.eventLog.push(entry);
    if (this.eventLog.length > this.maxLogEntries) {
      this.eventLog = this.eventLog.slice(-this.maxLogEntries);
    }
    this._pushToPanel('dev-sse-event', entry);
  }

  // ---------------------------------------------------------------------------
  // Panel window
  // ---------------------------------------------------------------------------

  /** Open (or focus) the unified devtools panel — singleton. */
  openPanel() {
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.panelWindow.focus();
      return;
    }

    this.panelWindow = new BrowserWindow({
      width: 960,
      height: 640,
      minWidth: 720,
      minHeight: 520,
      title: 'AHD DevTools',
      webPreferences: {
        preload: path.join(__dirname, 'devtools-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        devTools: true,
      },
    });

    this.panelWindow.loadFile(path.join(__dirname, 'devtools-panel.html'));

    // Replay buffered events once the panel renderer is ready
    this.panelWindow.webContents.on('did-finish-load', () => {
      for (const entry of this.eventLog) {
        this._pushToPanel('dev-sse-event', entry);
      }
      for (const entry of this.ipcLog) {
        this._pushToPanel('dev-ipc-call', entry);
      }
    });

    this.panelWindow.on('closed', () => {
      this.panelWindow = null;
    });
  }

  // ---------------------------------------------------------------------------
  // Dev-only IPC handlers — call after registerIpcHandlers
  // ---------------------------------------------------------------------------

  /**
   * Register dev-* IPC channels.  These are only called in development and
   * never collide with production channels (patchIpcMain skips dev-* too).
   * @param {import('./cache')} cacheManager
   */
  registerDevIpc(cacheManager) {
    const config = require('./config');

    ipcMain.handle('dev-get-state', () => ({
      gameState: cacheManager.getGameState(),
      cachedTurn: cacheManager.getCachedTurnData(),
      preferences: {
        theme: cacheManager.getTheme(),
        notificationsEnabled:
          cacheManager.getPreference('notificationsEnabled') !== false,
        miniModeEnabled:
          cacheManager.getPreference('miniModeEnabled') === true,
      },
      actionQueue: cacheManager.getQueuedActions(),
    }));

    ipcMain.handle('dev-get-config', () => ({
      GAME_URL: config.GAME_URL,
      WINDOW_WIDTH: config.WINDOW_WIDTH,
      WINDOW_HEIGHT: config.WINDOW_HEIGHT,
      NODE_ENV: process.env.NODE_ENV,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      sse: {
        connected: this.sseClient ? this.sseClient.isConnected() : false,
        eventCount: this.eventLog.length,
        ipcCallCount: this.ipcLog.length,
      },
    }));

    ipcMain.handle('dev-switch-server', (_event, urlOrPreset) => {
      const target = SERVER_PRESETS[urlOrPreset] || urlOrPreset;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.loadURL(target);
      }
    });

    ipcMain.handle('dev-reconnect-sse', () => {
      if (this.sseClient) this.sseClient.connect();
    });

    ipcMain.handle('dev-clear-cache', () => {
      cacheManager.clear();
    });
  }

  // ---------------------------------------------------------------------------
  // Menu integration
  // ---------------------------------------------------------------------------

  /**
   * Build the Developer menu template.
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildDevMenu() {
    const serverSubmenu = Object.entries(SERVER_PRESETS).map(([name, url]) => ({
      label: `${name.charAt(0).toUpperCase() + name.slice(1)} — ${url}`,
      click: () => this.switchServer(name),
    }));

    return {
      label: 'Developer',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Open DevTools Panel',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => this.openPanel(),
        },
        { type: 'separator' },
        {
          label: 'Switch Server',
          submenu: serverSubmenu,
        },
        { type: 'separator' },
        {
          label: `SSE: ${this.sseClient?.isConnected() ? 'Connected' : 'Disconnected'}`,
          enabled: false,
        },
        {
          label: 'Reconnect SSE',
          click: () => {
            if (this.sseClient) this.sseClient.connect();
          },
        },
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Misc helpers (used by menu and IPC)
  // ---------------------------------------------------------------------------

  /** @param {'local'|'staging'|'production'} preset */
  switchServer(preset) {
    const url = SERVER_PRESETS[preset];
    if (!url) return;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.loadURL(url);
    }
  }

  /** @returns {Record<string, string>} */
  getServerPresets() {
    return SERVER_PRESETS;
  }

  /** @returns {{sse: boolean, eventCount: number}} */
  getConnectionStatus() {
    return {
      sse: this.sseClient ? this.sseClient.isConnected() : false,
      eventCount: this.eventLog.length,
    };
  }

  /** @param {Electron.BrowserWindow} win */
  setWindow(win) {
    this.mainWindow = win;
  }

  /** Tear down the panel and clear buffers. */
  destroy() {
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.panelWindow.close();
    }
    this.eventLog = [];
    this.ipcLog = [];
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * @private
   * @param {string} channel
   * @param {*} data
   */
  _pushToPanel(channel, data) {
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.panelWindow.webContents.send(channel, data);
    }
  }

  /**
   * @private
   * @param {{channel:string, args:*, result:*, error:string|undefined, durationMs:number, timestamp:string}} entry
   */
  _logIpcCall(entry) {
    this.ipcLog.push(entry);
    if (this.ipcLog.length > this.maxIpcEntries) {
      this.ipcLog = this.ipcLog.slice(-this.maxIpcEntries);
    }
    this._pushToPanel('dev-ipc-call', entry);
  }
}

module.exports = DevToolsManager;
