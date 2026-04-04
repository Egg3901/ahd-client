'use strict';

const {
  validateClientNav,
  validateSSEEvent,
  validateErrorCatalog,
} = require('./api-validator');

/**
 * CompatibilityChecker — tracks API response conformance at runtime.
 *
 * Wraps the validators in api-validator.js and maintains a running log of
 * issues seen since startup. Exposes a status summary that the renderer
 * (and dev tools panel) can query via IPC to surface integration problems
 * without crashing the app.
 *
 * Usage:
 *   const cc = new CompatibilityChecker();
 *   const nav = await fetchClientNav();
 *   cc.checkClientNav(nav);          // logs any shape violations
 *   const status = cc.getStatus();   // { compatible, issues }
 */

const MAX_ISSUES = 50; // cap stored issues to avoid unbounded growth

class CompatibilityChecker {
  constructor() {
    /** @type {Array<{endpoint: string, errors: string[], timestamp: string}>} */
    this._issues = [];
  }

  // ── Checks ────────────────────────────────────────────────────────────────

  /**
   * Validate a /api/client-nav response and record any issues.
   * @param {unknown} data
   * @returns {boolean} true if valid
   */
  checkClientNav(data) {
    const { valid, errors } = validateClientNav(data);
    if (!valid) {
      this._record('/api/client-nav', errors);
    }
    return valid;
  }

  /**
   * Validate a parsed SSE event and record any issues.
   * Unknown-type events are recorded as informational only (valid returns true).
   * @param {unknown} event
   * @returns {boolean} true if structurally valid
   */
  checkSSEEvent(event) {
    const { valid, errors } = validateSSEEvent(event);
    if (errors.length > 0) {
      this._record('/api/events', errors);
    }
    return valid;
  }

  /**
   * Validate a /api/error-codes catalog response and record any issues.
   * @param {unknown} data
   * @returns {boolean} true if valid
   */
  checkErrorCatalog(data) {
    const { valid, errors } = validateErrorCatalog(data);
    if (!valid) {
      this._record('/api/error-codes', errors);
    }
    return valid;
  }

  // ── Status ────────────────────────────────────────────────────────────────

  /**
   * Returns a summary of all compatibility issues seen since startup.
   * @returns {{ compatible: boolean, issueCount: number, issues: Array }}
   */
  getStatus() {
    return {
      compatible: this._issues.length === 0,
      issueCount: this._issues.length,
      issues: this._issues.slice(), // return a copy
    };
  }

  /** Clear all recorded issues (e.g. after a successful reconnect). */
  clearIssues() {
    this._issues = [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * @private
   * @param {string} endpoint
   * @param {string[]} errors
   */
  _record(endpoint, errors) {
    console.warn(`[compat] ${endpoint}:`, errors.join('; '));
    if (this._issues.length >= MAX_ISSUES) {
      this._issues.shift(); // drop oldest to cap size
    }
    this._issues.push({
      endpoint,
      errors,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = CompatibilityChecker;
