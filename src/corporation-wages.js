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
 * /api/corporations/[id]/sectors/[sectorId]/wage for each sector with concurrency cap.
 *
 * The server rate-limits wage writes to 20/min per user (see
 * AHDGame/src/lib/corporations/commands/sectorOperations/setSectorWageLevel.ts).
 * We cap concurrency to 3 and add a small stagger to stay under the limit for
 * typical corps (< 30 sectors). Larger corps will partially succeed and report
 * per-sector results so the CEO can retry the remainder.
 *
 * @param {object} deps
 * @param {string} deps.gameUrl - Active game origin (from activeGameUrl.get())
 * @param {string} deps.corporationId - Corporation pathId or sequentialId
 * @param {number} deps.wageLevel - Desired level (will be clamped to [0.8, 1.5])
 * @param {(corpId: string, sectorId: string, wageLevel: number) => Promise<{ ok: boolean, status?: number }>} deps.setOne - Injected per-sector setter (siteApi.postSectorWage)
 * @param {() => Promise<Array<{ _id: string }>>} deps.listSectors - Injected sector lister (siteApi.fetchCorporationSectorIds)
 * @param {{ concurrency?: number }} [opts]
 * @returns {Promise<{ clamped: number, total: number, succeeded: number, failed: number, errors: Array<{ sectorId: string, error: string }> }>}
 */
async function bulkSetWageLevel(deps, opts = {}) {
  const { gameUrl, corporationId, wageLevel, setOne, listSectors } = deps;
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
    return { clamped, total: 0, succeeded: 0, failed: 0, errors: [] };
  }

  const concurrency = Math.max(1, Math.min(5, opts.concurrency ?? 3));
  let succeeded = 0;
  let failed = 0;
  const errors = [];

  // Simple concurrency pool
  let idx = 0;
  async function worker() {
    while (idx < sectors.length) {
      const i = idx++;
      const sector = sectors[i];
      const sectorId = sector._id || sector.id || String(sector);
      try {
        const res = await setOne(corporationId, sectorId, clamped);
        if (res && res.ok) succeeded++;
        else {
          failed++;
          errors.push({
            sectorId: String(sectorId),
            error: `HTTP ${res?.status ?? 'unknown'}`,
          });
        }
      } catch (err) {
        failed++;
        errors.push({
          sectorId: String(sectorId),
          error: err?.message || String(err),
        });
      }
      // Stagger to respect 20/min server rate limit when concurrency >1
      if (i < sectors.length - 1) await new Promise((r) => setTimeout(r, 120));
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, sectors.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return { clamped, total: sectors.length, succeeded, failed, errors };
}

module.exports = {
  WAGE_LEVEL_MIN,
  WAGE_LEVEL_MAX,
  WAGE_LEVEL_DEFAULT,
  WAGE_PRESETS,
  WAGE_PRESET_LABELS,
  clampWageLevel,
  formatWageLevel,
  validateCanAdjustWages,
  bulkSetWageLevel,
};
