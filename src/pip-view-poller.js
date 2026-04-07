const { net, session } = require('electron');
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
    this._fetchOne(path).then((data) => {
      this._onUpdate(this._view, data || {});
    });
  }

  /** @private @param {string[]} paths */
  _fetchCustom(paths) {
    Promise.all(paths.map((p) => this._fetchOne(p)))
      .then((results) => {
        const merged = {};
        for (let i = 0; i < paths.length; i++) {
          const key = this._pathToKey(paths[i]);
          if (key) merged[key] = results[i];
        }
        this._onUpdate('custom', merged);
      })
      .catch(() => {
        this._onUpdate('custom', {});
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

    /**
   * Get authentication cookies for the request.
   * @private
   * @returns {Promise<string>}
   */
  _getCookieHeader() {
    return session
      .fromPartition('persist:ahd')
      .cookies
      .get({ url: activeGameUrl.get() })
      .then((cookies) => cookies.map((c) => `${c.name}=${c.value}`).join('; '));
  }

  /** @private */
  async _fetchOne(path) {
    try {
      const cookieStr = await this._getCookieHeader();
      
      return new Promise((resolve, reject) => {
        let settled = false;
        const done = (val) => {
          if (settled) return;
          settled = true;
          resolve(val);
        };

        const req = net.request({
          url: `${activeGameUrl.get()}${path}`,
          method: 'GET',
        });
        
        req.setHeader('Cookie', cookieStr || '');
        req.setHeader('Accept', 'application/json');
        
        let body = '';
        
        req.on('response', (res) => {
          // Log response status for debugging
          console.log(`[PiP] ${path} → ${res.statusCode}`);
          
          if (res.statusCode === 401 || res.statusCode === 404) {
            done(null);
            return;
          }
          
          if (res.statusCode !== 200) {
            const error = new Error(`HTTP ${res.statusCode}`);
            console.error(`[PiP] ${path} failed:`, error.message);
            reject(error);
            return;
          }
          
          res.on('data', (chunk) => {
            if (settled) return;
            body += chunk.toString();
          });
          
          res.on('end', () => {
            if (settled) return;
            try {
              const parsed = JSON.parse(body);
              console.log(`[PiP] ${path} → success, data keys:`, Object.keys(parsed || {}));
              done(parsed);
            } catch (e) {
              console.error(`[PiP] ${path} JSON parse error:`, e.message);
              reject(e);
            }
          });
          
          res.on('error', (err) => {
            console.error(`[PiP] ${path} response error:`, err.message);
            if (!settled) reject(err);
          });
        });
        
        req.on('error', (err) => {
          if (!settled) {
            console.error(`[PiP] ${path} request error:`, err.message);
            reject(err);
          }
        });
        
        req.end();
      });
    } catch (err) {
      console.error(`[PiP] ${path} setup error:`, err.message);
      return null;
    }
  }
}

module.exports = PipViewPoller;
module.exports.PANEL_SOURCE = PANEL_SOURCE;
module.exports.VIEW_PATH = VIEW_PATH;
