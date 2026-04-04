'use strict';

const { net } = require('electron');
const config = require('./config');

/**
 * Loads and caches the /api/error-codes catalog at startup.
 * Maps machine-readable codes to user-friendly overlay display info.
 *
 * The catalog is fetched once and cached by version string.
 * Re-fetches automatically if the server version changes.
 */

/** Built-in display mappings for codes we know about. */
const DEFAULT_MAPPINGS = {
  UNAUTHORIZED: {
    title: 'Session Expired',
    message: 'Your session has expired. Please log in again.',
    actions: ['reload', 'home'],
  },
  FORBIDDEN: {
    title: 'Access Denied',
    message: "You don't have permission to do that.",
    actions: ['home'],
  },
  NOT_FOUND: {
    title: 'Page Not Found',
    message: "This page isn't available.",
    actions: ['back', 'home'],
  },
  INTERNAL_ERROR: {
    title: 'Server Error',
    message: 'Something went wrong on our end. Please try again.',
    actions: ['reload', 'home'],
  },
  BAD_REQUEST: {
    title: 'Invalid Request',
    message: 'That action could not be completed.',
    actions: ['back', 'home'],
  },
};

class ErrorHandler {
  constructor() {
    /** @type {string|null} */
    this._version = null;
    /** @type {object} */
    this._mappings = Object.assign({}, DEFAULT_MAPPINGS);
  }

  /**
   * Fetch /api/error-codes and merge server catalog into local mappings.
   * Safe to call at startup — silently no-ops if the server is unreachable.
   * @returns {Promise<void>}
   */
  loadErrorCodes() {
    return new Promise((resolve) => {
      let req;
      try {
        req = net.request({
          url: `${config.GAME_URL}/api/error-codes`,
          method: 'GET',
          partition: 'persist:ahd',
          useSessionCookies: true,
        });
      } catch {
        resolve();
        return;
      }

      req.setHeader('Accept', 'application/json');

      let body = '';
      req.on('response', (res) => {
        if (res.statusCode !== 200) {
          resolve();
          return;
        }
        res.on('data', (chunk) => (body += chunk.toString()));
        res.on('end', () => {
          try {
            const catalog = JSON.parse(body);
            if (catalog.version && catalog.version === this._version) {
              resolve();
              return;
            }
            this._version = catalog.version ?? null;
            for (const entry of catalog.errors || []) {
              if (!this._mappings[entry.code]) {
                // No built-in mapping — use server description as fallback
                this._mappings[entry.code] = {
                  title: entry.message,
                  message: entry.message,
                  actions: ['reload', 'home'],
                };
              }
            }
          } catch {
            // Ignore parse errors — keep defaults
          }
          resolve();
        });
        res.on('error', () => resolve());
      });
      req.on('error', () => resolve());
      req.end();
    });
  }

  /**
   * Get display info for an error code.
   * @param {string} code - Machine-readable code from API (e.g. 'NOT_FOUND')
   * @returns {{ title: string, message: string, actions: string[] }}
   */
  getMapping(code) {
    return (
      this._mappings[code] || {
        title: 'Something went wrong',
        message: 'An unexpected error occurred.',
        actions: ['reload', 'home'],
      }
    );
  }

  /**
   * Return all loaded mappings (useful for IPC — renderer can show contextual UI).
   * @returns {object}
   */
  getMappings() {
    return Object.assign({}, this._mappings);
  }

  /** @returns {string|null} */
  getVersion() {
    return this._version;
  }
}

module.exports = ErrorHandler;
