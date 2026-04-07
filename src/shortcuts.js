const { globalShortcut } = require('electron');
const activeGameUrl = require('./active-game-url');
const cacheManager = require('./cache-manager');

/**
 * Global keyboard shortcuts for the core action loop.
 * Works even when the app isn't focused (configurable).
 */

const DEFAULT_SHORTCUTS = {
  'CmdOrCtrl+Shift+C': {
    action: 'navigate',
    route: '/campaign',
    label: 'Campaign',
  },
  'CmdOrCtrl+Shift+F': {
    action: 'custom',
    handler: 'toggleFocusedView',
    label: 'Toggle Focused View',
  },
  'CmdOrCtrl+Alt+F': {
    action: 'navigate',
    route: '/campaign/fundraise',
    label: 'Fundraise',
  },
  'CmdOrCtrl+Shift+P': {
    action: 'navigate',
    route: '/poll',
    label: 'Poll',
  },
  'CmdOrCtrl+Shift+A': {
    action: 'navigate',
    route: '/campaign/advertise',
    label: 'Advertise',
  },
  'CmdOrCtrl+N': {
    action: 'navigate',
    route: '/notifications',
    label: 'Notifications',
  },
  'CmdOrCtrl+T': {
    action: 'custom',
    handler: 'toggleStatusBar',
    label: 'Toggle Status Bar',
  },
  'CmdOrCtrl+Shift+B': {
    action: 'custom',
    handler: 'openFeedback',
    label: 'Submit Feedback',
  },
  'CmdOrCtrl+Shift+M': {
    action: 'custom',
    handler: 'toggleMiniMode',
    label: 'Toggle Mini Mode',
  },
  'CmdOrCtrl+K': {
    action: 'custom',
    handler: 'openCommandPalette',
    label: 'Command Palette',
  },
};

class ShortcutManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow
   */
  constructor(mainWindow) {
    /** @type {Electron.BrowserWindow} */
    this.mainWindow = mainWindow;
    /** @type {boolean} */
    this.registered = false;
    /** @type {Record<string, () => void>} */
    this.customHandlers = {};
  }

  /**
   * Get effective shortcuts: defaults merged with custom overrides from cache.
   * Returns a map of accelerator -> config.
   * @returns {Object}
   */
  getEffectiveShortcuts() {
    const customShortcuts = cacheManager.getPreference('customShortcuts');
    if (!customShortcuts) return DEFAULT_SHORTCUTS;

    // customShortcuts is a map of defaultAccel -> customAccel
    // We need to build a new DEFAULT_SHORTCUTS-like object with updated accelerators
    const result = { ...DEFAULT_SHORTCUTS };

    Object.entries(customShortcuts).forEach(([defaultAccel, customAccel]) => {
      if (result[defaultAccel]) {
        // Move the config from default accelerator to custom accelerator
        result[customAccel] = result[defaultAccel];
        delete result[defaultAccel];
      }
    });

    return result;
  }

  /**
   * Get the current active shortcuts map (defaults merged with custom overrides).
   * @returns {Object}
   */
  getShortcuts() {
    return this.getEffectiveShortcuts();
  }

  /**
   * Register all shortcuts with the OS.
   * Safe to call multiple times — no-ops if already registered.
   * @param {Object} [shortcuts] - Optional shortcuts map (defaults to getEffectiveShortcuts())
   */
  registerAll(shortcuts) {
    if (this.registered) return;

    const shortcutsToUse = shortcuts || this.getEffectiveShortcuts();

    for (const [accelerator, shortcutConfig] of Object.entries(shortcutsToUse)) {
      try {
        globalShortcut.register(accelerator, () => {
          this.handleShortcut(shortcutConfig);
        });
      } catch (err) {
        console.warn(`Failed to register shortcut ${accelerator}:`, err);
      }
    }

    this.registered = true;
  }

  /**
   * Unregister a single shortcut by accelerator.
   * @param {string} accelerator
   */
  unregister(accelerator) {
    globalShortcut.unregister(accelerator);
  }

  /**
   * Execute a shortcut action (navigate or custom handler).
   * @param {{action: string, route?: string, handler?: string}} shortcut
   * @private
   */
  handleShortcut(shortcut) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    this.mainWindow.show();
    this.mainWindow.focus();

    switch (shortcut.action) {
      case 'navigate':
        this.mainWindow.loadURL(`${activeGameUrl.get()}${shortcut.route}`);
        break;
      case 'custom':
        if (this.customHandlers[shortcut.handler]) {
          this.customHandlers[shortcut.handler]();
        }
        break;
    }
  }

  /**
   * Register a named handler for 'custom' action shortcuts.
   * @param {string} name - Handler name matching shortcut.handler
   * @param {() => void} handler
   */
  onCustom(name, handler) {
    this.customHandlers[name] = handler;
  }

  /** @param {Electron.BrowserWindow} win */
  setWindow(win) {
    this.mainWindow = win;
  }

  /**
   * Unregister all global shortcuts. Called on app quit.
   */
  unregisterAll() {
    globalShortcut.unregisterAll();
    this.registered = false;
  }
}

module.exports = ShortcutManager;
