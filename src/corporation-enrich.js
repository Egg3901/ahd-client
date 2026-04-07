'use strict';

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function coerceFiniteNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * URL segment for `/corporation/${id}` — prefer API `pathId`; support legacy
 * sequential ids (including 0) and Mongo `_id`.
 * @param {object|null|undefined} corp
 * @returns {string|null}
 */
function corporationPathIdForUrl(corp) {
  if (!corp || typeof corp !== 'object') return null;
  if (typeof corp.pathId === 'string' && corp.pathId.trim()) {
    return corp.pathId.trim();
  }
  if (corp.sequentialId != null && corp.sequentialId !== '') {
    const n = Number(corp.sequentialId);
    if (Number.isFinite(n)) return String(n);
  }
  if (corp.sequential_id != null && corp.sequential_id !== '') {
    const n = Number(corp.sequential_id);
    if (Number.isFinite(n)) return String(n);
  }
  if (typeof corp._id === 'string' && corp._id.trim()) return corp._id.trim();
  if (typeof corp.id === 'string' && corp.id.trim()) return corp.id.trim();
  const nid = coerceFiniteNumber(corp.id);
  if (nid != null) return String(nid);
  return null;
}

/**
 * Remove corporation fields derived from /api/character/me (stale after 401,
 * logout, or leaving a corporation).
 * @param {object} manifest
 * @returns {object}
 */
function stripCorporationEnrichment(manifest) {
  const out = { ...manifest };
  delete out.myCorporationId;
  out.isCeo = false;
  return out;
}

/**
 * Merge GET /api/character/me corporation payload into the client-nav manifest.
 * Does not treat missing sequentialId as "no corporation".
 *
 * @param {object} manifest - normalized client-nav manifest
 * @param {object|null|undefined} me - parsed JSON body or null on error / non-2xx
 * @returns {object}
 */
function mergeCharacterMeIntoManifest(manifest, me) {
  if (!manifest.hasCharacter) {
    return stripCorporationEnrichment(manifest);
  }
  if (!me || typeof me !== 'object') {
    return stripCorporationEnrichment(manifest);
  }

  let corp = me.corporation;
  if (corp == null && me.character && typeof me.character === 'object') {
    corp = me.character.corporation;
  }
  if (corp == null) {
    return stripCorporationEnrichment(manifest);
  }

  if (typeof corp === 'number' || typeof corp === 'string') {
    let urlKey = null;
    if (typeof corp === 'number' && Number.isFinite(corp)) {
      urlKey = String(corp);
    } else if (typeof corp === 'string' && corp.trim()) {
      urlKey = corp.trim();
    } else {
      const n = coerceFiniteNumber(corp);
      if (n != null) urlKey = String(n);
    }
    const out = { ...manifest, isCeo: false };
    if (urlKey != null) out.myCorporationId = urlKey;
    return out;
  }

  if (typeof corp !== 'object') {
    return stripCorporationEnrichment(manifest);
  }

  const ch = me.character;
  const charId = ch && typeof ch === 'object' ? (ch._id ?? ch.id) : undefined;

  const isCeo =
    (charId != null &&
      corp.ceoId != null &&
      String(charId) === String(corp.ceoId)) ||
    manifest.isCeo === true ||
    corp.isCeo === true ||
    corp.role === 'CEO' ||
    corp.role === 'ceo';

  const urlKey = corporationPathIdForUrl(corp);
  const out = { ...manifest, isCeo };
  if (urlKey != null) {
    out.myCorporationId = urlKey;
  }
  return out;
}

module.exports = {
  coerceFiniteNumber,
  corporationPathIdForUrl,
  stripCorporationEnrichment,
  mergeCharacterMeIntoManifest,
};
