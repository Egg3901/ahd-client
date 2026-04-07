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
      displayMode: { type: 'string', default: 'focused' },
      /** @see game-panel-links.js — null means use automatic defaults */
      gamePanelEntries: { default: null },
      /** Supporter+ test server; toggled from View menu */
      useSandboxServer: { type: 'boolean', default: false },
      /** Local Next dev server; only honored when NODE_ENV=development */
      useDevServer: { type: 'boolean', default: false },
    },
  },
  gameState: {
    type: 'object',
    default: {
      // Core
      turnsUntilElection: null,
      actionPoints: null,
      maxActionPoints: null,
      currentDate: null,
      nextTurnIn: null,
      lastTurnTimestamp: null,
      // Funds & income
      funds: null,
      projectedIncome: null,
      incomeBreakdown: null,
      // Funds (extended)
      cashOnHand: null,
      portfolioValue: null,
      portfolioChangePercent: null,
      cashOnHandChangePercent: null,
      // Decay stats
      politicalInfluence: null,
      politicalInfluenceDecayWarning: false,
      favorability: null,
      favorabilityDecayWarning: false,
      infamy: null,
      infamyDecayWarning: false,
      // Election countdown
      electionDate: null,
      electionName: null,
      // Per-action AP costs
      actionCosts: null,
      // Unread mail count (from client-nav)
      unreadMailCount: null,
    },
  },
};

class CacheManager {
  constructor() {
    /** @type {Store} */
    this.store = new Store({
      name: 'ahd-cache',
      schema,
      encryptionKey: 'ahd-client-v1',
    });
  }

  // --- Turn data caching ---

  /**
   * Cache turn data with a timestamp for freshness tracking.
   * @param {object} data - Turn data from the SSE turn_complete event
   */
  cacheTurnData(data) {
    this.store.set('lastTurnData', {
      ...data,
      cachedAt: Date.now(),
    });
  }

  /** @returns {object} The last cached turn data, or {} if none */
  getCachedTurnData() {
    return this.store.get('lastTurnData', {});
  }

  // --- Action queuing ---

  /**
   * Add an action to the offline queue. Each gets a unique ID and timestamp.
   * @param {object} action - The action payload to queue
   * @returns {number} New queue length
   */
  queueAction(action) {
    const queue = this.store.get('actionQueue', []);
    queue.push({
      ...action,
      queuedAt: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      attempts: 0,
      status: 'queued',
    });
    this.store.set('actionQueue', queue);
    return queue.length;
  }

  /** @returns {object[]} All queued actions */
  getQueuedActions() {
    return this.store.get('actionQueue', []);
  }

  /** Clear the entire action queue (called after successful flush). */
  clearQueue() {
    this.store.set('actionQueue', []);
  }

  /**
   * Update the status and attempt count of a queued action.
   * @param {string} actionId
   * @param {'queued'|'retrying'|'completed'|'failed'} status
   * @param {string} [error] - Error message if status is 'failed'
   */
  updateActionStatus(actionId, status, error) {
    const queue = this.store.get('actionQueue', []);
    const action = queue.find((a) => a.id === actionId);
    if (!action) return;
    action.status = status;
    if (status === 'retrying' || status === 'failed') {
      action.attempts = (action.attempts || 0) + 1;
    }
    if (error) action.lastError = error;
    if (status === 'completed') action.completedAt = Date.now();
    this.store.set('actionQueue', queue);
  }

  /** @param {string} actionId - ID of the action to remove */
  removeFromQueue(actionId) {
    const queue = this.store.get('actionQueue', []);
    this.store.set(
      'actionQueue',
      queue.filter((a) => a.id !== actionId),
    );
  }

  /** @returns {number} */
  getQueueLength() {
    return this.store.get('actionQueue', []).length;
  }

  // --- User preferences ---

  /**
   * @param {string} key - Preference key (e.g. 'notificationsEnabled')
   * @returns {*}
   */
  getPreference(key) {
    return this.store.get(`userPreferences.${key}`);
  }

  /** @param {string} key @param {*} value */
  setPreference(key, value) {
    this.store.set(`userPreferences.${key}`, value);
  }

  /** @returns {string} Theme ID (default: 'default') */
  getTheme() {
    return this.store.get('userPreferences.theme', 'default');
  }

  /** @param {string} themeId */
  setTheme(themeId) {
    this.store.set('userPreferences.theme', themeId);
  }

  // --- Game state ---

  /**
   * Merge partial game state into the persisted store.
   * @param {object} state - Partial game state to merge
   */
  updateGameState(state) {
    const current = this.store.get('gameState', {});
    this.store.set('gameState', { ...current, ...state });
  }

  /** @returns {object} Full cached game state */
  getGameState() {
    return this.store.get('gameState', {});
  }

  // --- General ---

  /** Clear all cached data (turn data, queue, preferences, game state). */
  clear() {
    this.store.clear();
  }
}

module.exports = CacheManager;
