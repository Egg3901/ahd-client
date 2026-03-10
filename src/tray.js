const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const config = require('./config');

/**
 * System tray icon with live game status.
 * Shows turns until election, unread count, action points.
 * Badge the dock/taskbar icon with unread count.
 */
class TrayManager {
  constructor(mainWindow, notificationManager) {
    this.mainWindow = mainWindow;
    this.notificationManager = notificationManager;
    this.tray = null;
    this.gameState = {
      turnsUntilElection: '?',
      actionPoints: '?',
      currentDate: '',
    };
  }

  create() {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    let icon;
    try {
      icon = nativeImage.createFromPath(iconPath);
      icon = icon.resize({ width: 16, height: 16 });
    } catch {
      // Create a simple fallback icon
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

    this.updateMenu();
  }

  updateGameState(state) {
    Object.assign(this.gameState, state);
    this.updateMenu();
    this.updateBadge();
  }

  updateMenu() {
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

  navigateTo(route) {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.loadURL(`${config.GAME_URL}${route}`);
    }
  }

  setWindow(win) {
    this.mainWindow = win;
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
