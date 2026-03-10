const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const config = require('./config');

/**
 * System tray icon with live game status.
 * Shows turns until election, unread count, action points.
 * Badge the dock/taskbar icon with unread count.
 */
class TrayManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow - The primary app window
   * @param {import('./notifications')} notificationManager - For reading unread counts
   */
  constructor(mainWindow, notificationManager) {
    /** @type {Electron.BrowserWindow} */
    this.mainWindow = mainWindow;
    /** @type {import('./notifications')} */
    this.notificationManager = notificationManager;
    /** @type {Electron.Tray|null} */
    this.tray = null;
    /** @type {{turnsUntilElection: string|number, actionPoints: string|number, currentDate: string}} */
    this.gameState = {
      turnsUntilElection: '?',
      actionPoints: '?',
      currentDate: '',
    };
    /** @type {NodeJS.Timeout|null} Throttle timer for menu rebuilds */
    this._menuThrottle = null;
    /** @type {number} Minimum ms between tray menu rebuilds */
    this._menuThrottleMs = 1000;
  }

  /**
   * Create the system tray icon and attach event handlers.
   */
  create() {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    let icon;
    try {
      icon = nativeImage.createFromPath(iconPath);
      icon = icon.resize({ width: 16, height: 16 });
    } catch {
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('A House Divided');

    this.tray.on('click', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isVisible()) {
          this.mainWindow.focus();
        } else {
          this.mainWindow.show();
        }
      }
    });

    this.rebuildMenu();
  }

  /**
   * Merge new game state and refresh the tray display.
   * @param {{turnsUntilElection?: number, actionPoints?: number, currentDate?: string}} state
   */
  updateGameState(state) {
    Object.assign(this.gameState, state);
    this.updateMenu();
    this.updateBadge();
  }

  /**
   * Throttled wrapper around rebuildMenu(). Prevents excessive context menu
   * reconstructions when SSE events arrive in bursts.
   */
  updateMenu() {
    if (this._menuThrottle) return;
    this._menuThrottle = setTimeout(() => {
      this._menuThrottle = null;
      this.rebuildMenu();
    }, this._menuThrottleMs);
  }

  /**
   * Rebuild the tray context menu and tooltip with current state.
   * @private
   */
  rebuildMenu() {
    if (!this.tray) return;

    const unread = this.notificationManager
      ? this.notificationManager.getUnreadCount()
      : 0;

    const template = [
      {
        label: `Turns to Election: ${this.gameState.turnsUntilElection}`,
        enabled: false,
      },
      {
        label: `Action Points: ${this.gameState.actionPoints}`,
        enabled: false,
      },
      {
        label: `Unread: ${unread}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Open Campaign HQ',
        click: () => this.navigateTo('/campaign'),
      },
      {
        label: 'View Notifications',
        click: () => this.navigateTo('/notifications'),
      },
      {
        label: 'Quick Poll',
        click: () => this.navigateTo('/poll'),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ];

    this.tray.setContextMenu(Menu.buildFromTemplate(template));

    const tooltip = [
      'A House Divided',
      `Election in ${this.gameState.turnsUntilElection} turns`,
      `AP: ${this.gameState.actionPoints}`,
      unread > 0 ? `${unread} unread` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    this.tray.setToolTip(tooltip);
  }

  /**
   * Update dock/taskbar badge with the current unread count.
   */
  updateBadge() {
    const unread = this.notificationManager
      ? this.notificationManager.getUnreadCount()
      : 0;

    // Badge dock/taskbar icon
    if (app.setBadgeCount) {
      try {
        app.setBadgeCount(unread);
      } catch {
        // not supported on all platforms
      }
    }

    // On Windows, use overlay icon or progress bar for badge
    if (
      process.platform === 'win32' &&
      this.mainWindow &&
      !this.mainWindow.isDestroyed()
    ) {
      if (unread > 0) {
        this.mainWindow.setProgressBar(1, { mode: 'error' });
      } else {
        this.mainWindow.setProgressBar(-1);
      }
    }
  }

  /**
   * Navigate the main window to a game route and bring it to front.
   * @param {string} route - Path relative to GAME_URL (e.g. '/campaign')
   */
  navigateTo(route) {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.loadURL(`${config.GAME_URL}${route}`);
    }
  }

  /**
   * @param {Electron.BrowserWindow} win
   */
  setWindow(win) {
    this.mainWindow = win;
  }

  /**
   * Remove the tray icon and clean up throttle timers.
   */
  destroy() {
    if (this._menuThrottle) {
      clearTimeout(this._menuThrottle);
      this._menuThrottle = null;
    }
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
