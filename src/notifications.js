const { Notification, nativeImage } = require('electron');
const path = require('path');

/**
 * Maps SSE event types to user-friendly notification content.
 * Wires game events into native OS notifications.
 * Only fires when the main window is not focused.
 */

/** @type {Record<string, {title: string, format: (data: object) => string, urgent: boolean}>} */
const EVENT_CONFIG = {
  turn_complete: {
    title: 'Turn Complete',
    format: (data) => `Turn ${data.turn || ''} has ended. A new turn begins!`,
    urgent: false,
  },
  election_resolved: {
    title: 'Election Results',
    format: (data) =>
      data.winner
        ? `${data.winner} wins the ${data.office || 'election'}!`
        : 'Election results are in!',
    urgent: true,
  },
  bill_enacted: {
    title: 'Bill Enacted',
    format: (data) =>
      data.name
        ? `"${data.name}" has been signed into law.`
        : 'A new bill has been enacted!',
    urgent: true,
  },
  bill_voted: {
    title: 'Bill Vote',
    format: (data) =>
      data.name
        ? `Vote recorded on "${data.name}".`
        : 'A bill vote has been recorded.',
    urgent: false,
  },
  campaign_update: {
    title: 'Campaign Update',
    format: (data) => data.message || 'Your campaign has a new update.',
    urgent: false,
  },
  election_started: {
    title: 'Election Started',
    format: (data) =>
      data.office
        ? `A new ${data.office} election has begun!`
        : 'A new election has started!',
    urgent: true,
  },
  notification: {
    title: 'A House Divided',
    format: (data) =>
      typeof data === 'string' ? data : data.message || 'New notification',
    urgent: false,
  },
  action_points_refreshed: {
    title: 'Action Points Refreshed',
    format: (data) =>
      data.points
        ? `You have ${data.points} action points available.`
        : 'Your action points have been refreshed!',
    urgent: false,
  },
  poll_results: {
    title: 'Poll Results',
    format: (data) => data.message || 'New poll results are available.',
    urgent: false,
  },
  achievement_unlocked: {
    title: 'Achievement Unlocked!',
    format: (data) =>
      data.name
        ? `You earned: ${data.name}`
        : 'You unlocked a new achievement!',
    urgent: true,
  },
};

/** @type {Electron.NativeImage|null} Lazily-loaded app icon for notifications */
let appIcon = null;

/**
 * Load and cache the app icon for notifications.
 * @returns {Electron.NativeImage|null}
 */
function getIcon() {
  if (!appIcon) {
    try {
      appIcon = nativeImage.createFromPath(
        path.join(__dirname, '..', 'assets', 'icon.png'),
      );
    } catch {
      // icon not available
    }
  }
  return appIcon;
}

class NotificationManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow - The primary app window
   * @param {(route: string) => void} [onNavigate] - Optional callback for notification action navigation
   */
  constructor(mainWindow, onNavigate) {
    /** @type {Electron.BrowserWindow} */
    this.mainWindow = mainWindow;
    /** @type {(route: string) => void} */
    this.onNavigate = onNavigate;
    /** @type {boolean} */
    this.enabled = true;
    /** @type {number} */
    this.unreadCount = 0;
  }

  /**
   * Update the reference to the main window.
   * @param {Electron.BrowserWindow} win
   */
  setWindow(win) {
    this.mainWindow = win;
  }

  /**
   * Process an SSE event and show a native notification if appropriate.
   * Notifications are suppressed when the window is focused.
   * @param {{type: string, data: object}} event - The parsed SSE event
   */
  handleSSEEvent(event) {
    if (!this.enabled) return;
    if (!Notification.isSupported()) return;

    // Only notify for explicit types. Unknown types (including the SSE default
    // `message` when no `event:` field) previously fell back to EVENT_CONFIG.notification
    // and spammed the user for every server frame (e.g. theme_changed, heartbeats).
    const eventConfig = EVENT_CONFIG[event.type];
    if (!eventConfig) return;

    // Only notify when window is not focused
    if (this.mainWindow && this.mainWindow.isFocused()) {
      // Still track unread for tray badge
      if (event.type !== 'turn_complete') {
        this.unreadCount++;
      }
      return;
    }

    this.unreadCount++;

    const body =
      typeof eventConfig.format === 'function'
        ? eventConfig.format(event.data || {})
        : 'New game event';

    const notificationOptions = {
      title: eventConfig.title,
      body,
      icon: getIcon(),
      urgency: eventConfig.urgent ? 'critical' : 'normal',
      silent: !eventConfig.urgent,
    };

    // Add action buttons for supported events (macOS/Linux only)
    if (process.platform !== 'win32') {
      if (event.type === 'election_resolved') {
        notificationOptions.actions = [
          { type: 'button', text: 'View Election' },
        ];
      } else if (event.type === 'turn_complete') {
        notificationOptions.actions = [
          { type: 'button', text: 'View Dashboard' },
        ];
      }
    }

    const notification = new Notification(notificationOptions);

    notification.on('click', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
      this.clearUnread();
    });

    // Handle action button clicks (macOS/Linux only)
    notification.on('action', (_event, index) => {
      if (event.type === 'election_resolved' && index === 0) {
        if (this.onNavigate) {
          this.onNavigate('/elections');
        } else if (this.mainWindow) {
          this.mainWindow.loadURL(
            `${require('./active-game-url').get()}/elections`,
          );
        }
      } else if (event.type === 'turn_complete' && index === 0) {
        if (this.onNavigate) {
          this.onNavigate('/');
        } else if (this.mainWindow) {
          this.mainWindow.loadURL(require('./active-game-url').get());
        }
      }
      this.clearUnread();
    });

    notification.show();
  }

  /**
   * Reset the unread notification counter and clear any progress bar badge.
   */
  clearUnread() {
    this.unreadCount = 0;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.setProgressBar(-1);
      } catch {
        // ignore — progress bar not supported on all platforms
      }
    }
  }

  /**
   * @returns {number} The current unread notification count.
   */
  getUnreadCount() {
    return this.unreadCount;
  }

  /**
   * Enable or disable notifications.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

module.exports = NotificationManager;
