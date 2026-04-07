const { net, session } = require('electron');
const activeGameUrl = require('./active-game-url');

/**
 * Polls /api/game/turn/dashboard and maps the rich server response into the
 * flat gameState shape consumed by PipManager, TrayManager, and CacheManager.
 *
 * Polling strategy:
 *  - Immediate fetch when start() is called (first load)
 *  - On-demand via poll() — call this after turn_complete,
 *    action_points_refreshed, and campaign_update SSE events
 *  - Fallback every 10 s so the turn-countdown timer stays accurate
 *    even if SSE events are missed
 *
 * Authentication: uses the persist:ahd session partition so the game's
 * existing login cookies are sent automatically — no manual cookie plumbing.
 */

// Decay warning thresholds (client-side heuristics; server owns actual rules)
const PI_WARN_THRESHOLD = 20;
const FAV_WARN_THRESHOLD = 30;
const INF_WARN_THRESHOLD = 75;

class DashboardPoller {
  constructor() {
    /** @type {function(object): void | null} */
    this._callback = null;
    /** @type {NodeJS.Timeout|null} */
    this._interval = null;
    /** @type {number} Fallback poll period in ms (spec: 10s for dashboard bar) */
    this._POLL_MS = 10_000;
  }

  // ── Lifecycle ──

  /**
   * Start polling. Fires immediately, then every 10 s.
   * @param {function(object): void} callback - receives mapped gameState object
   */
  start(callback) {
    this._callback = callback;
    this._poll();
    this._interval = setInterval(() => this._poll(), this._POLL_MS);
  }

  /** Stop the fallback interval. On-demand poll() calls still work. */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._callback = null;
  }

  /**
   * Trigger an immediate fetch outside of the interval.
   * Call this after SSE events that change game state.
   */
  poll() {
    this._poll();
  }

  // ── Internal ──

  /** @private */
  _poll() {
    if (!this._callback) return;
    this._fetch()
      .then((mapped) => {
        if (mapped && this._callback) this._callback(mapped);
      })
      .catch((err) => console.warn('[dashboard] poll failed:', err.message));
  }

  /**
   * Get authentication cookies for the dashboard request.
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

  /**
   * HTTP GET /api/game/turn/dashboard using the game session partition.
   * @private
   * @returns {Promise<object|null>} mapped gameState, or null if unauthenticated
   */
  async _fetch() {
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
          url: `${activeGameUrl.get()}/api/game/turn/dashboard`,
          method: 'GET',
        });

        req.setHeader('Cookie', cookieStr || '');
        req.setHeader('Accept', 'application/json');

        let body = '';

        const timer = setTimeout(() => {
          req.abort();
          if (!settled) {
            settled = true;
            reject(new Error('Request timeout'));
          }
        }, 15_000);

        req.on('response', (res) => {
          clearTimeout(timer);
          console.log(`[Dashboard] /api/game/turn/dashboard → ${res.statusCode}`);

          // 401 = not logged in, 404 = route not deployed yet — both are silent
          if (res.statusCode === 401 || res.statusCode === 404) {
            done(null);
            return;
          }
          if (res.statusCode !== 200) {
            const error = new Error(`HTTP ${res.statusCode}`);
            console.error('[Dashboard] Failed:', error.message);
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
              const mapped = this._map(parsed);
              console.log('[Dashboard] Success, mapped keys:', Object.keys(mapped || {}));
              done(mapped);
            } catch (e) {
              console.error('[Dashboard] JSON parse error:', e.message);
              reject(e);
            }
          });

          res.on('error', (err) => {
            console.error('[Dashboard] Response error:', err.message);
            if (!settled) reject(err);
          });
        });

        req.on('error', (err) => {
          clearTimeout(timer);
          if (!settled) {
            console.error('[Dashboard] Request error:', err.message);
            reject(err);
          }
        });

        req.end();
      });
    } catch (err) {
      console.error('[Dashboard] Setup error:', err.message);
      return null;
    }
  }

  /**
   * Map the raw /api/game/turn/dashboard payload to the flat gameState shape.
   *
   * Server fields           → Client gameState field
   * ─────────────────────────────────────────────────
   * gameState.currentYear   → currentDate
   * gameState.nextScheduled → nextTurnIn (formatted relative time)
   * character.actions       → actionPoints
   * actionsPerTurn.total    → maxActionPoints
   * character.funds         → funds
   * fundIncome.netPerTurn   → projectedIncome
   * fundIncome.*            → incomeBreakdown
   * character.political…    → politicalInfluence / favorability / infamy
   * decayProjections.*      → *DecayWarning booleans
   * actionCosts.*           → actionCosts (key rename: buildDonorBase→donorBuild)
   * nearestElection.*       → electionDate / electionName / turnsUntilElection / electionIsCandidate
   * decayProjections.*      → *Projected, *Decaying (PI / favorability)
   * fundIncome.state/nationalTax → incomeBreakdown.statePartyTax / nationalPartyTax
   *
   * Portfolio / cash (optional — website should add to /api/game/turn/dashboard):
   *   character.portfolioValue          → portfolioValue
   *   character.portfolioChangePercent  → portfolioChangePercent (number, e.g. 1.25 = +1.25%)
   *   character.cashOnHand              → cashOnHand
   *   character.cashOnHandChangePercent → cashOnHandChangePercent
   * If omitted, the PiP derives % vs the previous poll in-session when possible.
   *
   * @private
   * @param {object} d - Raw API response
   * @returns {object}
   */
  _map(d) {
    const gs = d.gameState || {};
    const ch = d.character || null;
    const ac = d.actionCosts || {};
    const fi = d.fundIncome || {};
    const apt = d.actionsPerTurn || {};
    const dp = d.decayProjections || {};
    const ne = d.nearestElection || null;

    const out = {};

    // ── Turn / date ──────────────────────────────────────────────────────
    if (gs.currentYear != null) {
      out.currentDate = String(gs.currentYear);
    }
    out.nextTurnIn = this._fmtCountdown(
      gs.isActive ? gs.nextScheduledTurn : null,
      gs.isActive,
    );

    // ── Action points ────────────────────────────────────────────────────
    if (ch) out.actionPoints = ch.actions ?? null;
    if (apt.total != null) out.maxActionPoints = apt.total;

    // ── Funds & income ───────────────────────────────────────────────────
    if (ch) {
      out.funds = ch.funds ?? null;
      if (ch.nationalInfluence != null)
        out.nationalInfluence = ch.nationalInfluence;
      if (ch.hasCorp === true || ch.hasCorp === false) out.hasCorp = ch.hasCorp;
      if (ch.cashOnHand != null) out.cashOnHand = ch.cashOnHand;
      if (ch.portfolioValue != null) out.portfolioValue = ch.portfolioValue;
      if (ch.portfolioChangePercent != null)
        out.portfolioChangePercent = ch.portfolioChangePercent;
      if (ch.cashOnHandChangePercent != null)
        out.cashOnHandChangePercent = ch.cashOnHandChangePercent;
    }
    if (fi.netPerTurn != null) out.projectedIncome = fi.netPerTurn;
    if (Object.keys(fi).length > 0) {
      out.incomeBreakdown = {
        base: fi.baseGeneration ?? null,
        donorBonus: fi.donorBaseBonus ?? null,
        officeSalary: fi.officeBonus ?? null,
        // Combine state + national party taxes into a single deduction
        partyTax: (fi.stateTax ?? 0) + (fi.nationalTax ?? 0) || null,
        statePartyTax: fi.stateTax ?? null,
        nationalPartyTax: fi.nationalTax ?? null,
      };
    }

    // ── Decay stats ──────────────────────────────────────────────────────
    if (ch) {
      out.politicalInfluence = ch.politicalInfluence ?? null;
      out.favorability = ch.favorability ?? null;
      out.infamy = ch.infamy ?? null;
    }

    const piDp = dp.politicalInfluence;
    if (piDp) {
      out.politicalInfluenceDecayWarning =
        piDp.isDecaying && (piDp.projected ?? piDp.current) < PI_WARN_THRESHOLD;
      if (piDp.projected != null)
        out.politicalInfluenceProjected = piDp.projected;
      if (piDp.isDecaying != null)
        out.politicalInfluenceDecaying = piDp.isDecaying;
    }

    const favDp = dp.favorability;
    if (favDp) {
      // Favorability only decays above threshold=40, so warn when it drops
      // close to or below that floor (or is generally low)
      out.favorabilityDecayWarning =
        favDp.isDecaying &&
        (favDp.projected ?? favDp.current) < FAV_WARN_THRESHOLD;
      if (favDp.projected != null) out.favorabilityProjected = favDp.projected;
      if (favDp.isDecaying != null) out.favorabilityDecaying = favDp.isDecaying;
    }

    const infDp = dp.infamy;
    if (infDp) {
      out.infamyDecayWarning = infDp.isDecaying;
      out.infamyDecayAmount = infDp.decayAmount;
      out.infamyProjected = infDp.projected;
    } else if (ch && ch.infamy != null) {
      out.infamyDecayWarning = ch.infamy > INF_WARN_THRESHOLD;
    }

    // ── Action costs ─────────────────────────────────────────────────────
    if (Object.keys(ac).length > 0) {
      out.actionCosts = {
        fundraise: ac.fundraise ?? 1,
        advertise: ac.advertise ?? 2,
        donorBuild: ac.buildDonorBase ?? 3,
        poll: ac.poll ?? 2,
        campaign: ac.campaign ?? 2,
      };
    }

    // ── Nearest election ─────────────────────────────────────────────────
    if (ne) {
      // Use primary end time if we're in the primary phase
      const endTime = ne.inPrimary
        ? (ne.primaryEndTime ?? ne.endTime)
        : ne.endTime;

      if (endTime) {
        out.electionDate = endTime;

        // Derive turnsUntilElection (1 turn = 1 hour) for tray compatibility
        const hoursLeft = (new Date(endTime) - Date.now()) / 3_600_000;
        if (hoursLeft > 0) out.turnsUntilElection = Math.ceil(hoursLeft);
      }

      const phase = ne.inPrimary ? 'Primary' : '';
      const type = ne.electionType
        ? ne.electionType.charAt(0).toUpperCase() + ne.electionType.slice(1)
        : '';
      const statePart =
        ne.state && ne.state !== 'National' ? ` (${ne.state})` : '';
      out.electionName = [phase, type].filter(Boolean).join(' ') + statePart;
      out.electionIsCandidate = ne.isCandidate ?? false;
    }

    return out;
  }

  /**
   * Convert an ISO timestamp to a human-readable time-remaining string.
   * @private
   * @param {string|null} isoTimestamp
   * @param {boolean} isActive
   * @returns {string}
   */
  _fmtCountdown(isoTimestamp, isActive) {
    if (!isActive) return 'Paused';
    if (!isoTimestamp) return '—';
    try {
      const diff = new Date(isoTimestamp) - Date.now();
      if (diff <= 0) return 'Processing…';
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    } catch {
      return '—';
    }
  }
}

module.exports = DashboardPoller;
