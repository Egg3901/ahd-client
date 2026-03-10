const { globalShortcut } = require('electron');
const config = require('./config');

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
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.registered = false;
    this.customHandlers = {};
  }

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

  handleShortcut(shortcut) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    this.mainWindow.show();
    this.mainWindow.focus();

    switch (shortcut.action) {
      case 'navigate':
        this.mainWindow.loadURL(`${config.GAME_URL}${shortcut.route}`);
        break;
      case 'custom':
        if (this.customHandlers[shortcut.handler]) {
          this.customHandlers[shortcut.handler]();
        }
        break;
    }
  }

  onCustom(name, handler) {
    this.customHandlers[name] = handler;
  }

  setWindow(win) {
    this.mainWindow = win;
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
    this.registered = false;
  }
}

module.exports = ShortcutManager;
