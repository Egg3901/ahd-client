const { BrowserWindow, screen } = require('electron');
const path = require('path');
const activeGameUrl = require('./active-game-url');

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
    route: '/country/us/legislature',
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
    title: 'Map — A House Divided',
    route: '/country/us/map',
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
  /**
   * @param {import('./cache')|null} [cacheManager]
   */
  constructor(cacheManager) {
    /** @type {Map<string, Electron.BrowserWindow>} */
    this.windows = new Map();
    /** @type {import('./cache')|null} */
    this._cache = cacheManager || null;
    /** @type {Map<string, NodeJS.Timeout>} */
    this._boundsTimers = new Map();
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

    // Restore saved bounds if available and on-screen
    const savedBounds = this._cache
      ? this._cache.getPreference(`windowBounds.${preset}`)
      : null;
    const bounds =
      savedBounds && this._isVisibleBounds(savedBounds)
        ? {
            x: savedBounds.x,
            y: savedBounds.y,
            width: Math.max(savedBounds.width, 400),
            height: Math.max(savedBounds.height, 300),
          }
        : { width: presetConfig.width, height: presetConfig.height };

    const win = new BrowserWindow({
      ...bounds,
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
        partition: 'persist:ahd',
      },
    });

    win.loadURL(`${activeGameUrl.get()}${presetConfig.route}`);
    win.setMenuBarVisibility(false);

    const saveBounds = () => this._scheduleBoundsSave(preset, win);
    win.on('resize', saveBounds);
    win.on('move', saveBounds);

    win.on('closed', () => {
      const timer = this._boundsTimers.get(preset);
      if (timer) {
        clearTimeout(timer);
        this._boundsTimers.delete(preset);
      }
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
        partition: 'persist:ahd',
      },
    });

    win.loadURL(url.startsWith('http') ? url : `${activeGameUrl.get()}${url}`);
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
   * Debounce-save bounds for a preset window (500ms).
   * @param {string} preset
   * @param {Electron.BrowserWindow} win
   * @private
   */
  _scheduleBoundsSave(preset, win) {
    if (!this._cache) return;
    const existing = this._boundsTimers.get(preset);
    if (existing) clearTimeout(existing);
    this._boundsTimers.set(
      preset,
      setTimeout(() => {
        this._boundsTimers.delete(preset);
        if (!win.isDestroyed()) {
          const b = win.getBounds();
          this._cache.setPreference(`windowBounds.${preset}`, b);
        }
      }, 500),
    );
  }

  /**
   * Returns true if the bounds intersect at least one display's work area.
   * @param {{x: number, y: number, width: number, height: number}} bounds
   * @returns {boolean}
   * @private
   */
  _isVisibleBounds(bounds) {
    return screen.getAllDisplays().some((d) => {
      const wa = d.workArea;
      return (
        bounds.x < wa.x + wa.width &&
        bounds.x + bounds.width > wa.x &&
        bounds.y < wa.y + wa.height &&
        bounds.y + bounds.height > wa.y
      );
    });
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
