const { BrowserWindow } = require('electron');
const path = require('path');
const config = require('./config');

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
  constructor(mainWindow, sseClient) {
    this.mainWindow = mainWindow;
    this.sseClient = sseClient;
    this.eventLogWindow = null;
    this.eventLog = [];
    this.maxLogEntries = 500;
  }

  logEvent(event) {
    this.eventLog.push({
      timestamp: new Date().toISOString(),
      type: event.type,
      data: event.data,
    });

    if (this.eventLog.length > this.maxLogEntries) {
      this.eventLog = this.eventLog.slice(-this.maxLogEntries);
    }

    this.updateEventLogWindow();
  }

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

  updateEventLogWindow() {
    if (!this.eventLogWindow || this.eventLogWindow.isDestroyed()) return;

    this.eventLogWindow.webContents.executeJavaScript(`
      if (typeof updateLog === 'function') {
        updateLog(${JSON.stringify(this.eventLog.slice(-100))});
      }
    `);
  }

  switchServer(preset) {
    const url = SERVER_PRESETS[preset];
    if (!url) return;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.loadURL(url);
    }
  }

  getServerPresets() {
    return SERVER_PRESETS;
  }

  getConnectionStatus() {
    return {
      sse: this.sseClient ? this.sseClient.isConnected() : false,
      eventCount: this.eventLog.length,
    };
  }

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

  setWindow(win) {
    this.mainWindow = win;
  }

  destroy() {
    if (this.eventLogWindow && !this.eventLogWindow.isDestroyed()) {
      this.eventLogWindow.close();
    }
    this.eventLog = [];
  }
}

module.exports = DevToolsManager;
