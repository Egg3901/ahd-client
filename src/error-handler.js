const { net } = require('electron');
const activeGameUrl = require('./active-game-url');

/**
 * Client-side overlay defaults — used for network/navigation failures.
 * Server error catalog (from /api/error-codes) supplements these for
 * API-level errors that the client intercepts.
 */
const OVERLAY_DEFAULTS = {
  'not-found': {
    message: "This page isn't available yet",
  },
  connection: {
    message: "Couldn't connect — check your internet connection",
  },
  certificate: {
    message:
      "Couldn't connect securely - the game server's security certificate " +
      "is invalid or expired. If your computer's date or time is wrong, " +
      'correct it and retry; otherwise the site owner must renew the certificate.',
  },
  'server-error': {
    message:
      "The game server is having trouble right now - it's most likely " +
      'processing a turn. Give it a minute, then hit Retry.',
  },
};

/**
 * Fetches and caches the error code catalog from /api/error-codes.
 * Provides overlay message resolution and server error code lookup.
 */
class ErrorHandler {
  constructor() {
    /** @type {object[]} Error entries from /api/error-codes */
    this._catalog = [];
    /** @type {string|null} Catalog version for staleness detection */
    this._catalogVersion = null;
  }

  /**
   * Fetch the error code catalog from the game server and cache it.
   * Safe to call multiple times; silently no-ops on failure so the
   * client always has a working fallback via OVERLAY_DEFAULTS.
   * @returns {Promise<void>}
   */
  loadErrorCodes() {
    return new Promise((resolve) => {
      const req = net.request({
        url: `${activeGameUrl.get()}/api/error-codes`,
        method: 'GET',
        partition: 'persist:ahd',
        useSessionCookies: true,
      });
      req.setHeader('Accept', 'application/json');

      // Accumulate raw Buffers and decode once at the end so multi-byte
      // UTF-8 sequences split across chunk boundaries are not corrupted.
      /** @type {Buffer[]} */
      const chunks = [];
      req.on('response', (res) => {
        if (res.statusCode !== 200) {
          resolve();
          return;
        }
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (Array.isArray(parsed.errors)) {
              this._catalog = parsed.errors;
              this._catalogVersion = parsed.version ?? null;
            }
          } catch {
            // Silently ignore parse errors — OVERLAY_DEFAULTS remain active
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
   * Get the overlay message for a given error type.
   * @param {'not-found'|'connection'|'certificate'|'server-error'} type
   * @returns {string}
   */
  getOverlayMessage(type) {
    return (
      OVERLAY_DEFAULTS[type]?.message ?? OVERLAY_DEFAULTS.connection.message
    );
  }

  /**
   * Look up a server error entry by machine code (e.g. 'NOT_FOUND').
   * @param {string} code
   * @returns {object|null}
   */
  findByCode(code) {
    return this._catalog.find((e) => e.code === code) ?? null;
  }
}

module.exports = ErrorHandler;
