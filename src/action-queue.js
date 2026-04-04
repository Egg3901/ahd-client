const { EventEmitter } = require('events');

/**
 * Manages the persistent offline action queue.
 *
 * The thin-client model means game actions are executed by the web app
 * running inside the BrowserWindow, not by the Electron main process.
 * ActionQueue therefore acts as a relay:
 *
 *   1. Renderer calls queue-action IPC → ActionQueue persists it via CacheManager.
 *   2. On SSE reconnect, ActionQueue sends pending actions to the renderer
 *      via flush-queue, marking each as 'retrying'.
 *   3. Renderer replays each action against the game API and reports the
 *      result back via the action-result IPC channel.
 *   4. On success the action is removed. On failure, ActionQueue increments
 *      the attempt counter; once maxRetries is reached it marks the action
 *      'failed' and emits 'action-failed' so the UI can notify the user.
 *
 * All state is persisted via CacheManager (electron-store) so queued
 * actions survive app restarts.
 */
class ActionQueue extends EventEmitter {
  /**
   * @param {import('./cache')} cacheManager
   * @param {{ maxRetries?: number, retryDelay?: number }} [opts]
   */
  constructor(cacheManager, { maxRetries = 3, retryDelay = 5000 } = {}) {
    super();
    /** @type {import('./cache')} */
    this._cache = cacheManager;
    /** @type {number} Maximum replay attempts before marking an action failed */
    this._maxRetries = maxRetries;
    /** @type {number} Delay in ms before re-flushing after a partial failure */
    this._retryDelay = retryDelay;
    /** @type {NodeJS.Timeout|null} */
    this._retryTimer = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Persist a new action. Called when the renderer queues an action while
   * offline.
   * @param {object} action - Action payload from the renderer
   * @returns {number} New queue length
   */
  add(action) {
    return this._cache.queueAction(action);
  }

  /**
   * Send all pending actions to the renderer for replay, and mark each as
   * 'retrying'. Call this on every SSE reconnect.
   * @param {function(string, object[]): void} sendToRenderer
   */
  flush(sendToRenderer) {
    const pending = this._getPending();
    if (pending.length === 0) return;

    for (const action of pending) {
      this._cache.updateActionStatus(action.id, 'retrying');
    }
    sendToRenderer('flush-queue', pending);
  }

  /**
   * Handle a renderer report of action success or failure.
   * Called from the action-result IPC handler.
   *
   * @param {string} actionId
   * @param {boolean} success
   * @param {string} [error] - Error message when success is false
   */
  reportResult(actionId, success, error) {
    if (success) {
      this._cache.updateActionStatus(actionId, 'completed');
      this._cache.removeFromQueue(actionId);
      return;
    }

    // Failure path: check remaining retries
    const actions = this._cache.getQueuedActions();
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;

    if (action.attempts >= this._maxRetries) {
      this._cache.updateActionStatus(actionId, 'failed', error);
      this.emit('action-failed', { ...action, lastError: error });
    } else {
      // Reset to 'queued' so the next flush picks it up again
      this._cache.updateActionStatus(actionId, 'queued');
      this._scheduleRetry();
    }
  }

  /**
   * Cancel any pending retry timer and clear the in-memory retry state.
   * Call this on app quit / window close.
   */
  destroy() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  /**
   * @returns {object[]} All actions that are not completed or permanently failed
   */
  getPending() {
    return this._getPending();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /** @private */
  _getPending() {
    return this._cache
      .getQueuedActions()
      .filter((a) => a.status !== 'completed' && a.status !== 'failed');
  }

  /**
   * Schedule a re-flush after retryDelay ms. The caller (main.js) must pass
   * sendToRenderer into flush(); this timer only signals readiness, it does
   * not flush directly. Emit 'retry-ready' so main.js can call flush() again.
   * @private
   */
  _scheduleRetry() {
    if (this._retryTimer) return; // already scheduled
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this.emit('retry-ready');
    }, this._retryDelay);
  }
}

module.exports = ActionQueue;
