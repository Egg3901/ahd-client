const Store = require('electron-store');

/**
 * Offline caching and action queuing.
 * Caches last turn data so the app opens instantly.
 * Queues actions locally when server is unreachable and syncs on reconnect.
 */

const schema = {
  lastTurnData: {
    type: 'object',
    default: {},
  },
  actionQueue: {
    type: 'array',
    default: [],
    items: {
      type: 'object',
    },
  },
  userPreferences: {
    type: 'object',
    default: {},
    properties: {
      theme: { type: 'string', default: 'default' },
      notificationsEnabled: { type: 'boolean', default: true },
      miniModeEnabled: { type: 'boolean', default: false },
    },
  },
  gameState: {
    type: 'object',
    default: {
      turnsUntilElection: null,
      actionPoints: null,
      currentDate: null,
      lastTurnTimestamp: null,
    },
  },
};

class CacheManager {
  constructor() {
    this.store = new Store({
      name: 'ahd-cache',
      schema,
      encryptionKey: 'ahd-client-v1',
    });
  }

  // --- Turn data caching ---

  cacheTurnData(data) {
    this.store.set('lastTurnData', {
      ...data,
      cachedAt: Date.now(),
    });
  }

  getCachedTurnData() {
    return this.store.get('lastTurnData', {});
  }

  // --- Action queuing ---

  queueAction(action) {
    const queue = this.store.get('actionQueue', []);
    queue.push({
      ...action,
      queuedAt: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    });
    this.store.set('actionQueue', queue);
    return queue.length;
  }

  getQueuedActions() {
    return this.store.get('actionQueue', []);
  }

  clearQueue() {
    this.store.set('actionQueue', []);
  }

  removeFromQueue(actionId) {
    const queue = this.store.get('actionQueue', []);
    this.store.set(
      'actionQueue',
      queue.filter((a) => a.id !== actionId),
    );
  }

  getQueueLength() {
    return this.store.get('actionQueue', []).length;
  }

  // --- User preferences ---

  getPreference(key) {
    return this.store.get(`userPreferences.${key}`);
  }

  setPreference(key, value) {
    this.store.set(`userPreferences.${key}`, value);
  }

  getTheme() {
    return this.store.get('userPreferences.theme', 'default');
  }

  setTheme(themeId) {
    this.store.set('userPreferences.theme', themeId);
  }

  // --- Game state ---

  updateGameState(state) {
    const current = this.store.get('gameState', {});
    this.store.set('gameState', { ...current, ...state });
  }

  getGameState() {
    return this.store.get('gameState', {});
  }

  // --- General ---

  clear() {
    this.store.clear();
  }
}

module.exports = CacheManager;
