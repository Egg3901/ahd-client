'use strict';

/**
 * ActionQueue — wraps CacheManager's persistent queue with retry logic,
 * per-action status tracking, and automatic flush on SSE reconnect.
 *
 * Status lifecycle: queued → processing → completed | failed
 * Retry policy: up to MAX_ATTEMPTS with RETRY_DELAY_MS between tries.
 *
 * The renderer is responsible for actually executing actions against the
 * game API. This module handles persistence, retry scheduling, and
 * surfacing status updates back to the renderer via IPC.
 */

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

class ActionQueue {
  /**
   * @param {import('./cache')} cacheManager
   * @param {function(string, *): void} sendToRenderer - main-process send fn
   */
  constructor(cacheManager, sendToRenderer) {
    this._cache = cacheManager;
    this._send = sendToRenderer;
    this._processing = false;
    /** @type {NodeJS.Timeout|null} */
    this._retryTimeout = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Add an action to the persistent queue and notify the renderer.
   * @param {object} action
   * @returns {number} New queue length
   */
  enqueue(action) {
    const len = this._cache.queueAction(action);
    this._notifyStatus();
    return len;
  }

  /**
   * Flush queued actions to the renderer for execution.
   * Called automatically on SSE reconnect and can be triggered manually.
   */
  flush() {
    const queue = this._cache.getQueuedActions();
    if (queue.length === 0) return;

    this._processing = true;
    this._send('flush-queue', queue);
    this._notifyStatus();
  }

  /**
   * Mark an action as completed and remove it from the persistent queue.
   * @param {string} actionId
   */
  complete(actionId) {
    this._cache.removeFromQueue(actionId);
    if (this._cache.getQueueLength() === 0) {
      this._processing = false;
    }
    this._notifyStatus();
  }

  /**
   * Record a failed attempt for an action. Schedules a retry if attempts
   * remain; marks the action permanently failed otherwise.
   * @param {string} actionId
   * @param {string} errorMessage
   */
  fail(actionId, errorMessage) {
    const queue = this._cache.getQueuedActions();
    const action = queue.find((a) => a.id === actionId);
    if (!action) return;

    action.attempts = (action.attempts || 0) + 1;
    action.lastError = errorMessage;

    if (action.attempts >= MAX_ATTEMPTS) {
      action.status = 'failed';
      this._cache.updateActionInQueue(actionId, {
        attempts: action.attempts,
        lastError: errorMessage,
        status: 'failed',
      });
      this._processing = false;
      this._send('queue-action-failed', { actionId, error: errorMessage });
    } else {
      this._cache.updateActionInQueue(actionId, {
        attempts: action.attempts,
        lastError: errorMessage,
      });
      // Schedule retry
      if (!this._retryTimeout) {
        this._retryTimeout = setTimeout(() => {
          this._retryTimeout = null;
          this.flush();
        }, RETRY_DELAY_MS);
      }
    }

    this._notifyStatus();
  }

  /**
   * Clear all actions from the queue (including failed ones).
   */
  clear() {
    this._cache.clearQueue();
    this._processing = false;
    if (this._retryTimeout) {
      clearTimeout(this._retryTimeout);
      this._retryTimeout = null;
    }
    this._notifyStatus();
  }

  /** @returns {number} */
  get length() {
    return this._cache.getQueueLength();
  }

  /** Cancel pending retry timeout on shutdown. */
  destroy() {
    if (this._retryTimeout) {
      clearTimeout(this._retryTimeout);
      this._retryTimeout = null;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** @private */
  _notifyStatus() {
    this._send('queue-status', {
      queued: this._cache.getQueueLength(),
      processing: this._processing,
    });
  }
}

module.exports = ActionQueue;
