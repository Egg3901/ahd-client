const { net } = require('electron');
const activeGameUrl = require('./active-game-url');

/** @type {Record<string, string>} view name → HTTP path */
const VIEW_PATH = {
  standard: '/api/pip/standard',
  elections: '/api/pip/elections',
  corp: '/api/pip/corp',
  global: '/api/pip/global',
};

/**
 * Panel ID → which /api/pip/* bundle feeds it (custom layout only).
 * `null` = use dashboard bar state only (no extra PiP fetch).
 * @type {Record<string, 'standard'|'elections'|'corp'|'global'|null>}
 */
const PANEL_SOURCE = {
  'my-status': null,
  'my-election': 'elections',
  'decay-stats': 'standard',
  'income-breakdown': 'standard',
  notifications: 'standard',
  legislature: 'elections',
  'elections-feed': 'elections',
  'my-corp': 'corp',
  commodities: 'corp',
  'top-corps': 'corp',
  'country-snapshot': 'global',
  crises: 'global',
  'mail-count': 'standard',
  'portfolio-value': null,
};

/**
 * Polls GET /api/pip/* for the active themed view (60s). On view change:
 * immediate fetch + interval reset. Custom view fetches every bundle needed
 * by the user's panel list in parallel.
 */
class PipViewPoller {
  /**
   * @param {() => string[]} getCustomPanelIds
   * @param {(viewName: string, data: object) => void} onUpdate
   */
  constructor(getCustomPanelIds, onUpdate) {
    this._getCustomPanelIds = getCustomPanelIds;
    this._onUpdate = onUpdate;
    /** @type {'standard'|'corp'|'elections'|'global'|'custom'} */
    this._view = 'standard';
    /** @type {NodeJS.Timeout|null} */
    this._interval = null;
    this._POLL_MS = 60_000;
  }

  /**
   * @param {'standard'|'corp'|'elections'|'global'|'custom'} viewName
   */
  setView(viewName) {
    this._view = viewName;
    this._fetchNow();
    this._resetInterval();
  }

  start() {
    this._fetchNow();
    this._resetInterval();
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /** Immediate refresh without changing view (e.g. custom layout saved). */
  fetchNow() {
    this._fetchNow();
  }

  /** @private */
  _resetInterval() {
    if (this._interval) clearInterval(this._interval);
    this._interval = setInterval(() => this._fetchNow(), this._POLL_MS);
  }

  /** @private */
  _fetchNow() {
    const paths = this._getEndpoints(this._view);
    if (paths.length === 0) {
      this._onUpdate(this._view, {});
      return;
    }
    if (this._view === 'custom') {
      this._fetchCustom(paths);
      return;
    }
    const path = paths[0];
    this._fetchOne(path)
      .then((data) => {
        this._onUpdate(this._view, data || {});
      })
      .catch(() => {
        // Preserve stale viewState on fetch failure.
      });
  }

  /** @private @param {string[]} paths */
  _fetchCustom(paths) {
    Promise.allSettled(paths.map((p) => this._fetchOne(p)))
      .then((results) => {
        const merged = {};
        for (let i = 0; i < paths.length; i++) {
          const key = this._pathToKey(paths[i]);
          if (key && results[i].status === 'fulfilled' && results[i].value) {
            merged[key] = results[i].value;
          }
        }
        this._onUpdate('custom', merged);
      })
      .catch((err) => {
        console.warn('[pip-view-poller] custom fetch failed:', err.message);
      });
  }

  /** @private */
  _pathToKey(path) {
    const entry = Object.entries(VIEW_PATH).find(([, p]) => p === path);
    return entry ? entry[0] : null;
  }

  /**
   * @param {'standard'|'corp'|'elections'|'global'|'custom'} view
   * @returns {string[]} URL paths (no host)
   */
  _getEndpoints(view) {
    if (view === 'custom') {
      const ids = this._getCustomPanelIds() || [];
      const need = new Set();
      for (const id of ids) {
        const src = PANEL_SOURCE[id];
        if (src && VIEW_PATH[src]) need.add(VIEW_PATH[src]);
      }
      return Array.from(need);
    }
    const p = VIEW_PATH[view];
    return p ? [p] : [];
  }

  /** @private */
  _fetchOne(path) {
    return new Promise((resolve, reject) => {
      const req = net.request({
        url: `${activeGameUrl.get()}${path}`,
        method: 'GET',
        partition: 'persist:ahd',
        useSessionCookies: true,
      });
      req.setHeader('Accept', 'application/json');
      let body = '';
      const timer = setTimeout(() => {
        req.abort();
        reject(new Error('Request timeout'));
      }, 15_000);
      req.on('response', (res) => {
        clearTimeout(timer);
        if (res.statusCode === 401 || res.statusCode === 404) {
          resolve(null);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.on('data', (chunk) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });
      req.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      req.end();
    });
  }
}

module.exports = PipViewPoller;
module.exports.PANEL_SOURCE = PANEL_SOURCE;
module.exports.VIEW_PATH = VIEW_PATH;
