const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Developer-focused features.
 * SSE event log viewer, server switcher, connection status,
 * and seed data launcher.
 */

const SERVER_PRESETS = {
  local: 'http://localhost:3000',
  staging: 'https://staging.ahousedivided.online',
  production: 'https://ahousedivided.online',
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
    this.eventLogWindow = null;
    /** @type {Array<{timestamp: string, type: string, data: *}>} Ring buffer of SSE events */
    this.eventLog = [];
    /** @type {number} */
    this.maxLogEntries = 500;
    /** @type {NodeJS.Timeout|null} Batched update timer for event log window */
    this._logUpdateTimer = null;
  }

  /**
   * Record an SSE event in the ring buffer and schedule a batched UI update.
   * @param {{type: string, data: *}} event
   */
  logEvent(event) {
    this.eventLog.push({
      timestamp: new Date().toISOString(),
      type: event.type,
      data: event.data,
    });

    if (this.eventLog.length > this.maxLogEntries) {
      this.eventLog = this.eventLog.slice(-this.maxLogEntries);
    }

    // Batch UI updates — at most once per 500ms to avoid thrashing
    if (!this._logUpdateTimer) {
      this._logUpdateTimer = setTimeout(() => {
        this._logUpdateTimer = null;
        this.updateEventLogWindow();
      }, 500);
    }
  }

  /** Open the SSE event log viewer window (singleton). */
  openEventLog() {
    if (this.eventLogWindow && !this.eventLogWindow.isDestroyed()) {
      this.eventLogWindow.focus();
      return;
    }

    this.eventLogWindow = new BrowserWindow({
      width: 700,
      height: 500,
      title: 'SSE Event Log — Dev',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.eventLogWindow.loadFile(path.join(__dirname, 'event-log.html'));

    this.eventLogWindow.webContents.on('did-finish-load', () => {
      this.updateEventLogWindow();
    });

    this.eventLogWindow.on('closed', () => {
      this.eventLogWindow = null;
    });
  }

  /** @private Push latest events to the event log window */
  updateEventLogWindow() {
    if (!this.eventLogWindow || this.eventLogWindow.isDestroyed()) return;

    this.eventLogWindow.webContents.executeJavaScript(`
      if (typeof updateLog === 'function') {
        updateLog(${JSON.stringify(this.eventLog.slice(-100))});
      }
    `);
  }

  /**
   * Switch the main window to a different server.
   * @param {'local'|'staging'|'production'} preset
   */
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

  /**
   * Build a Developer menu template for use in the application menu.
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildDevMenu() {
    const serverSubmenu = Object.entries(SERVER_PRESETS).map(([name, url]) => ({
      label: `${name.charAt(0).toUpperCase() + name.slice(1)} (${url})`,
      click: () => this.switchServer(name),
    }));

    return {
      label: 'Developer',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Switch Server',
          submenu: serverSubmenu,
        },
        { type: 'separator' },
        {
          label: 'SSE Event Log',
          click: () => this.openEventLog(),
        },
        {
          label: `SSE: ${this.sseClient?.isConnected() ? 'Connected' : 'Disconnected'}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'Reconnect SSE',
          click: () => {
            if (this.sseClient) this.sseClient.connect();
          },
        },
      ],
    };
  }

  /** @param {Electron.BrowserWindow} win */
  setWindow(win) {
    this.mainWindow = win;
  }

  /** Close the event log window and clear the buffer. */
  destroy() {
    if (this._logUpdateTimer) {
      clearTimeout(this._logUpdateTimer);
      this._logUpdateTimer = null;
    }
    if (this.eventLogWindow && !this.eventLogWindow.isDestroyed()) {
      this.eventLogWindow.close();
    }
    this.eventLog = [];
  }
}

module.exports = DevToolsManager;
