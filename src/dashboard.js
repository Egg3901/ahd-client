const { net } = require('electron');
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
   * HTTP GET /api/game/turn/dashboard using the game session partition.
   * @private
   * @returns {Promise<object|null>} mapped gameState, or null if unauthenticated
   */
  _fetch() {
    return new Promise((resolve, reject) => {
      const req = net.request({
        url: `${activeGameUrl.get()}/api/game/turn/dashboard`,
        method: 'GET',
        partition: 'persist:ahd',
        useSessionCookies: true,
      });

      req.setHeader('Accept', 'application/json');

      let body = '';

      req.on('response', (res) => {
        // 401 = not logged in, 404 = route not deployed yet — both are silent
        if (res.statusCode === 401 || res.statusCode === 404) {
          resolve(null);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.on('data', (chunk) => (body += chunk.toString()));
        res.on('end', () => {
          try {
            resolve(this._map(JSON.parse(body)));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.end();
    });
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

    // Infamy: high is bad — warn when above threshold regardless of decay
    if (ch && ch.infamy != null) {
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
