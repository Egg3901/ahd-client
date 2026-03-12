const { BrowserWindow } = require('electron');
const path = require('path');
const appConfig = require('./config');

/**
 * Multi-window support. Lets users pop out election maps,
 * Congress tracker, Campaign HQ into separate resizable windows.
 * Each preset is a singleton — opening the same preset twice focuses the existing window.
 */

/** @type {Record<string, {title: string, route: string, width: number, height: number}>} */
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
    /** @type {Map<string, Electron.BrowserWindow>} */
    this.windows = new Map();
  }

  /**
   * Open a preset pop-out window (or focus it if already open).
   * @param {string} preset - Key from WINDOW_PRESETS (e.g. 'elections', 'congress')
   * @param {Electron.BrowserWindow} [parentWindow] - Optional parent for child window behavior
   * @returns {Electron.BrowserWindow|null}
   */
  openWindow(preset, parentWindow) {
    const presetConfig = WINDOW_PRESETS[preset];
    if (!presetConfig) return null;

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
      width: presetConfig.width,
      height: presetConfig.height,
      minWidth: 400,
      minHeight: 300,
      title: presetConfig.title,
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      parent: parentWindow || undefined,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.loadURL(`${appConfig.GAME_URL}${presetConfig.route}`);
    win.setMenuBarVisibility(false);

    win.on('closed', () => {
      this.windows.delete(preset);
    });

    this.windows.set(preset, win);
    return win;
  }

  /**
   * Open an arbitrary URL in a new window (non-singleton).
   * @param {string} url - Full URL or path relative to GAME_URL
   * @param {{width?: number, height?: number, title?: string}} [options]
   * @returns {Electron.BrowserWindow}
   */
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

    win.loadURL(url.startsWith('http') ? url : `${appConfig.GAME_URL}${url}`);
    win.setMenuBarVisibility(false);

    const id = `custom-${Date.now()}`;
    win.on('closed', () => this.windows.delete(id));
    this.windows.set(id, win);
    return win;
  }

  /**
   * Update the congress and country preset routes/titles to match the given nav config.
   * @param {{ legislature: {route: string, label: string}, map: {route: string, label: string} }} nav
   */
  updatePresets(nav) {
    if (WINDOW_PRESETS.congress) {
      WINDOW_PRESETS.congress.route = nav.legislature.route;
      WINDOW_PRESETS.congress.title = `${nav.legislature.label} — A House Divided`;
    }
    if (WINDOW_PRESETS.country) {
      WINDOW_PRESETS.country.route = nav.map.route;
      WINDOW_PRESETS.country.title = 'Map — A House Divided';
    }
  }

  /**
   * Close all managed pop-out windows.
   */
  closeAll() {
    for (const [, win] of this.windows) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
    this.windows.clear();
  }

  /** @returns {string[]} Available preset names */
  getPresets() {
    return Object.keys(WINDOW_PRESETS);
  }

  /**
   * @param {string} preset
   * @returns {{title: string, route: string, width: number, height: number}|undefined}
   */
  getPresetConfig(preset) {
    return WINDOW_PRESETS[preset];
  }
}

module.exports = WindowManager;
