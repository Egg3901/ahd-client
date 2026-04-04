'use strict';

/**
 * Normalize paths from the renderer before loading (focused nav uses /profile per site).
 *
 * @param {string} path - Relative path (e.g. /settings or settings)
 * @returns {string} Path starting with /
 */
function resolveGamePath(path) {
  let p = String(path || '').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  return p;
}

module.exports = { resolveGamePath };
