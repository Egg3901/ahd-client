const { Notification, nativeImage } = require('electron');
const path = require('path');

/**
 * Maps SSE event types to user-friendly notification content.
 * Wires game events into native OS notifications.
 */

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

let appIcon = null;

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
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.enabled = true;
    this.unreadCount = 0;
  }

  setWindow(win) {
    this.mainWindow = win;
  }

  handleSSEEvent(event) {
    if (!this.enabled) return;
    if (!Notification.isSupported()) return;

    const eventConfig = EVENT_CONFIG[event.type] || EVENT_CONFIG.notification;
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

    const notification = new Notification({
      title: eventConfig.title,
      body,
      icon: getIcon(),
      urgency: eventConfig.urgent ? 'critical' : 'normal',
      silent: !eventConfig.urgent,
    });

    notification.on('click', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
      this.clearUnread();
    });

    notification.show();
  }

  clearUnread() {
    this.unreadCount = 0;
    if (this.mainWindow && this.mainWindow.setProgressBar) {
      try {
        this.mainWindow.setProgressBar(-1);
      } catch {
        // ignore
      }
    }
  }

  getUnreadCount() {
    return this.unreadCount;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

module.exports = NotificationManager;
