'use strict';

/**
 * Bulk wage controls for CEO corporations.
 * Mirrors the server's labour constants (AHDGame/src/lib/labour/laborCost.ts):
 *   WAGE_LEVEL_MIN = 0.8, WAGE_LEVEL_MAX = 1.5, WAGE_LEVEL_DEFAULT = 1.0
 * UI exposes presets and a fine-grained slider; all inputs are clamped to [0.8, 1.5].
 */

const WAGE_LEVEL_MIN = 0.8;
const WAGE_LEVEL_MAX = 1.5;
const WAGE_LEVEL_DEFAULT = 1.0;

/**
 * Server-side write budget for wage changes, mirrored so the client can pace
 * itself instead of discovering the limit by getting 429'd.
 * Source: `checkRateLimit(auth.user.userId, 20, 60000)` in AHDGame
 * `src/lib/corporations/commands/sectorOperations/setSectorWageLevel.ts`.
 */
const BULK_WAGE_MAX_PER_WINDOW = 20;
const BULK_WAGE_WINDOW_MS = 60000;

/**
 * Preset levels shown in the Wages submenu / dialog.
 * Covers the full [0.8, 1.5] range with the commonly used baseline 1.0 in the middle.
 * @type {number[]}
 */
const WAGE_PRESETS = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5];

/**
 * Human labels for presets (used in menu and confirmation dialogs).
 * @type {Record<number, string>}
 */
const WAGE_PRESET_LABELS = {
  0.8: '0.80x — Minimum (cut costs, risks unrest)',
  0.9: '0.90x — Lean',
  1.0: '1.00x — Baseline (profit-invariant)',
  1.1: '1.10x — Generous',
  1.2: '1.20x — High pay',
  1.3: '1.30x — Premium',
  1.5: '1.50x — Maximum (best morale/quality)',
};

/**
 * Clamp a requested wage level into [WAGE_LEVEL_MIN, WAGE_LEVEL_MAX].
 * Non-finite inputs return the default (1.0) to avoid writing NaN to the DB.
 * @param {number} value
 * @returns {number}
 */
function clampWageLevel(value) {
  if (!Number.isFinite(value)) return WAGE_LEVEL_DEFAULT;
  return Math.min(WAGE_LEVEL_MAX, Math.max(WAGE_LEVEL_MIN, value));
}

/**
 * Format a wage level for display (e.g. 0.8 -> "0.80x").
 * @param {number} level
 * @returns {string}
 */
function formatWageLevel(level) {
  const v = clampWageLevel(level);
  return `${v.toFixed(2)}x`;
}

/**
 * Validate that the current manifest/CEO state allows bulk wage changes.
 * @param {object|null} manifest - Latest client-nav manifest (from MenuManager)
 * @returns {{ ok: boolean, reason?: string, corporationId?: string }}
 */
function validateCanAdjustWages(manifest) {
  if (!manifest || !manifest.hasCharacter) {
    return { ok: false, reason: 'No active character — sign in first.' };
  }
  if (!manifest.isCeo) {
    return { ok: false, reason: 'Only the CEO can adjust wages.' };
  }
  const corpId = manifest.myCorporationId;
  if (corpId == null || String(corpId).trim() === '') {
    return { ok: false, reason: 'No corporation found for this character.' };
  }
  return { ok: true, corporationId: String(corpId) };
}

/**
 * Apply a wage level to every sector of a corporation via the authenticated API.
 * Fan-out strategy: fetch corporation detail to enumerate sectors, then POST
 * /api/corporations/[id]/sectors/[sectorId]/wage for each sector.
 *
 * Pacing is the whole problem here. The server allows 20 wage writes per
 * 60 s per user, enforced as a FIXED window whose boundary the client cannot
 * see (AHDGame `src/lib/api/rateLimit.ts`, called from
 * `setSectorWageLevel.ts` as `checkRateLimit(userId, 20, 60_000)`).
 *
 * Sector counts in production: 661 corporations, mean 6.8 sectors, but 30
 * corporations hold more than 20 and the largest holds 105. So the common
 * case must stay instant while the tail must not shred itself against the
 * limiter.
 *
 * Two mechanisms, belt and braces:
 *   1. A rolling-window pacer admits at most MAX_PER_WINDOW starts in any
 *      WINDOW_MS. A rolling window is strictly more conservative than the
 *      server's fixed window, so it cannot overrun it. Corps at or under 20
 *      sectors never wait at all.
 *   2. Any 429 that still lands is honoured, not counted as a failure: the
 *      worker sleeps for `Retry-After` and retries that sector.
 *
 * @param {object} deps
 * @param {string} deps.gameUrl - Active game origin (from activeGameUrl.get())
 * @param {string} deps.corporationId - Corporation pathId or sequentialId
 * @param {number} deps.wageLevel - Desired level (will be clamped to [0.8, 1.5])
 * @param {(corpId: string, sectorId: string, wageLevel: number) => Promise<{ ok: boolean, statusCode?: number, retryAfter?: number|null }>} deps.setOne - Injected per-sector setter (siteApi.postSectorWage)
 * @param {(gameUrl: string, corpId: string) => Promise<Array<{ _id: string }>>} deps.listSectors - Injected sector lister (siteApi.fetchCorporationSectorIds)
 * @param {(progress: { done: number, total: number }) => void} [deps.onProgress] - Called after each sector settles
 * @param {object} [opts]
 * @param {number} [opts.maxPerWindow=20] - Requests admitted per window
 * @param {number} [opts.windowMs=60000] - Pacing window in ms
 * @param {number} [opts.maxRetries=3] - Retries per sector on 429
 * @param {(ms: number) => Promise<void>} [opts.sleep] - Injected for tests
 * @param {() => number} [opts.now] - Injected for tests
 * @returns {Promise<{ clamped: number, total: number, succeeded: number, failed: number, rateLimitWaits: number, errors: Array<{ sectorId: string, error: string }> }>}
 */
async function bulkSetWageLevel(deps, opts = {}) {
  const { gameUrl, corporationId, wageLevel, setOne, listSectors, onProgress } =
    deps;
  if (
    !gameUrl ||
    !corporationId ||
    typeof setOne !== 'function' ||
    typeof listSectors !== 'function'
  ) {
    throw new Error('bulkSetWageLevel: missing required deps');
  }
  const clamped = clampWageLevel(wageLevel);
  const sectors = await listSectors(gameUrl, corporationId);
  if (!sectors || sectors.length === 0) {
    return {
      clamped,
      total: 0,
      succeeded: 0,
      failed: 0,
      rateLimitWaits: 0,
      errors: [],
    };
  }

  const maxPerWindow = Math.max(
    1,
    opts.maxPerWindow ?? BULK_WAGE_MAX_PER_WINDOW,
  );
  const windowMs = Math.max(0, opts.windowMs ?? BULK_WAGE_WINDOW_MS);
  const maxRetries = Math.max(0, opts.maxRetries ?? 3);
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))));

  let succeeded = 0;
  let failed = 0;
  let rateLimitWaits = 0;
  let done = 0;
  const errors = [];

  /**
   * Timestamps of requests admitted inside the current rolling window.
   * @type {number[]}
   */
  const admitted = [];

  /** Block until the pacer can admit another request. */
  async function admit() {
    for (;;) {
      const t = now();
      while (admitted.length > 0 && t - admitted[0] >= windowMs) {
        admitted.shift();
      }
      if (admitted.length < maxPerWindow) {
        admitted.push(t);
        return;
      }
      // +250ms of slack so we land clear of the boundary, not exactly on it.
      await sleep(windowMs - (t - admitted[0]) + 250);
    }
  }

  // Serial by design: with a 20-per-60s ceiling, concurrency buys nothing
  // once the pacer is the bottleneck, and it makes the 429 path racy.
  for (const sector of sectors) {
    const sectorId = String(sector?._id || sector?.id || sector);
    let attempt = 0;

    for (;;) {
      await admit();
      let res;
      try {
        res = await setOne(corporationId, sectorId, clamped);
      } catch (err) {
        failed++;
        errors.push({ sectorId, error: err?.message || String(err) });
        break;
      }

      if (res && res.ok) {
        succeeded++;
        break;
      }

      // 429 is a pacing miss, not a failure — wait it out and retry.
      if (res && res.statusCode === 429 && attempt < maxRetries) {
        attempt++;
        rateLimitWaits++;
        const waitSec =
          typeof res.retryAfter === 'number' && res.retryAfter > 0
            ? res.retryAfter
            : Math.ceil(windowMs / 1000);
        // The server's window clearly does not match ours — drop our
        // bookkeeping so the pacer restarts from the post-wait boundary.
        admitted.length = 0;
        await sleep(waitSec * 1000 + 250);
        continue;
      }

      failed++;
      errors.push({
        sectorId,
        error:
          res && res.statusCode === 429
            ? `rate limited (gave up after ${maxRetries} retries)`
            : `HTTP ${res?.statusCode ?? 'unknown'}`,
      });
      break;
    }

    done++;
    if (typeof onProgress === 'function') {
      onProgress({ done, total: sectors.length });
    }
  }

  return {
    clamped,
    total: sectors.length,
    succeeded,
    failed,
    rateLimitWaits,
    errors,
  };
}

/**
 * Lower bound on how long a bulk apply will take, in ms, given the pacer.
 * Used to warn the CEO before starting: a 105-sector corp is a ~5 minute job
 * and it should not look like a hang.
 * @param {number} sectorCount
 * @param {{ maxPerWindow?: number, windowMs?: number }} [opts]
 * @returns {number}
 */
function estimateBulkWageDurationMs(sectorCount, opts = {}) {
  const maxPerWindow = Math.max(
    1,
    opts.maxPerWindow ?? BULK_WAGE_MAX_PER_WINDOW,
  );
  const windowMs = Math.max(0, opts.windowMs ?? BULK_WAGE_WINDOW_MS);
  if (!Number.isFinite(sectorCount) || sectorCount <= maxPerWindow) return 0;
  return Math.ceil(sectorCount / maxPerWindow - 1) * windowMs;
}

/**
 * Human phrasing for an estimate, e.g. "about 5 minutes".
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 60000) return 'under a minute';
  const minutes = Math.round(ms / 60000);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

module.exports = {
  WAGE_LEVEL_MIN,
  WAGE_LEVEL_MAX,
  WAGE_LEVEL_DEFAULT,
  WAGE_PRESETS,
  WAGE_PRESET_LABELS,
  BULK_WAGE_MAX_PER_WINDOW,
  BULK_WAGE_WINDOW_MS,
  clampWageLevel,
  formatWageLevel,
  validateCanAdjustWages,
  bulkSetWageLevel,
  estimateBulkWageDurationMs,
  formatDuration,
};
