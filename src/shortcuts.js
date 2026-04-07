const { globalShortcut } = require('electron');
const activeGameUrl = require('./active-game-url');

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
   * Register all default shortcuts with the OS.
   * Safe to call multiple times — no-ops if already registered.
   */
  registerAll() {
    if (this.registered) return;

    for (const [accelerator, shortcut] of Object.entries(DEFAULT_SHORTCUTS)) {
      try {
        globalShortcut.register(accelerator, () => {
          this.handleShortcut(shortcut);
        });
      } catch (err) {
        console.warn(`Failed to register shortcut ${accelerator}:`, err);
      }
    }

    this.registered = true;
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
