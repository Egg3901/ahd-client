const { BrowserWindow } = require('electron');
const path = require('path');
const config = require('./config');

/**
 * Multi-window support. Lets users pop out election maps,
 * Congress tracker, Campaign HQ into separate resizable windows.
 */

const WINDOW_PRESETS = {
  elections: {
    title: 'Elections — A House Divided',
    route: '/elections',
    width: 900,
    height: 700,
  },
  congress: {
    title: 'Congress — A House Divided',
    route: '/legislature',
    width: 1000,
    height: 700,
  },
  campaign: {
    title: 'Campaign HQ — A House Divided',
    route: '/campaign',
    width: 900,
    height: 700,
  },
  state: {
    title: 'State View — A House Divided',
    route: '/state',
    width: 800,
    height: 600,
  },
  country: {
    title: 'Country Overview — A House Divided',
    route: '/country',
    width: 1000,
    height: 700,
  },
  notifications: {
    title: 'Notifications — A House Divided',
    route: '/notifications',
    width: 600,
    height: 500,
  },
};

class WindowManager {
  constructor() {
    this.windows = new Map();
  }

  openWindow(preset, parentWindow) {
    const config_ = WINDOW_PRESETS[preset];
    if (!config_) return null;

    // If window already open, focus it
    if (this.windows.has(preset)) {
      const existing = this.windows.get(preset);
      if (!existing.isDestroyed()) {
        existing.focus();
        return existing;
      }
      this.windows.delete(preset);
    }

    const win = new BrowserWindow({
      width: config_.width,
      height: config_.height,
      minWidth: 400,
      minHeight: 300,
      title: config_.title,
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      parent: parentWindow || undefined,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.loadURL(`${config.GAME_URL}${config_.route}`);
    win.setMenuBarVisibility(false);

    win.on('closed', () => {
      this.windows.delete(preset);
    });

    this.windows.set(preset, win);
    return win;
  }

  openCustom(url, options = {}) {
    const win = new BrowserWindow({
      width: options.width || 800,
      height: options.height || 600,
      minWidth: 400,
      minHeight: 300,
      title: options.title || 'A House Divided',
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.loadURL(url.startsWith('http') ? url : `${config.GAME_URL}${url}`);
    win.setMenuBarVisibility(false);

    const id = `custom-${Date.now()}`;
    win.on('closed', () => this.windows.delete(id));
    this.windows.set(id, win);
    return win;
  }

  closeAll() {
    for (const [key, win] of this.windows) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
    this.windows.clear();
  }

  getPresets() {
    return Object.keys(WINDOW_PRESETS);
  }

  getPresetConfig(preset) {
    return WINDOW_PRESETS[preset];
  }
}

module.exports = WindowManager;
