'use strict';

const { session, net } = require('electron');
const { version: CLIENT_VERSION } = require('../package.json');

const PARTITION = 'persist:ahd';
const MAX_JSON_BYTES = 512 * 1024;

/** @type {Promise<object|null>|null} */
let clientNavInFlight = null;

/**
 * @param {string} gameUrl
 * @returns {Promise<string>}
 */
function getCookieHeader(gameUrl) {
  return session
    .fromPartition(PARTITION)
    .cookies.get({ url: gameUrl })
    .then((cookies) => cookies.map((c) => `${c.name}=${c.value}`).join('; '));
}

/**
 * GET JSON with session cookies (same partition as the game window).
 * @param {string} gameUrl
 * @param {string} path
 * @returns {Promise<object|null>}
 */
function getJsonAuthed(gameUrl, path) {
  const fullUrl = `${gameUrl}${path.startsWith('/') ? path : `/${path}`}`;
  // Never reject on cookie-store failure — callers treat null as "unavailable"
  return getCookieHeader(gameUrl)
    .catch(() => '')
    .then(
      (cookieStr) =>
        new Promise((resolve) => {
          let settled = false;
          const done = (val) => {
            if (settled) return;
            settled = true;
            resolve(val);
          };

          const req = net.request({ url: fullUrl, method: 'GET' });
          req.setHeader('Cookie', cookieStr);
          req.setHeader('Accept', 'application/json');
          req.setHeader('X-AHD-Client-Version', CLIENT_VERSION);

          // Accumulate raw Buffers and decode once at the end so multi-byte
          // UTF-8 sequences split across chunk boundaries are not corrupted.
          /** @type {Buffer[]} */
          const chunks = [];
          let totalBytes = 0;
          req.on('response', (res) => {
            const statusCode = res.statusCode ?? 0;
            res.on('data', (chunk) => {
              if (settled) return;
              chunks.push(chunk);
              totalBytes += chunk.length;
              if (totalBytes > MAX_JSON_BYTES) {
                res.destroy();
                done(null);
              }
            });
            res.on('end', () => {
              if (settled) return;
              const body = Buffer.concat(chunks).toString('utf8');
              if (statusCode < 200 || statusCode >= 300) {
                done(null);
                return;
              }
              try {
                done(JSON.parse(body));
              } catch {
                done(null);
              }
            });
            res.on('error', () => done(null));
          });
          req.on('error', () => done(null));
          req.end();
        }),
    );
}

/**
 * Fetch GET /api/client-nav with coalescing.
 * @param {string} gameUrl
 * @returns {Promise<object|null>}
 */
function fetchClientNav(gameUrl) {
  if (clientNavInFlight) return clientNavInFlight;

  const p = getJsonAuthed(gameUrl, '/api/client-nav');
  clientNavInFlight = p.finally(() => {
    clientNavInFlight = null;
  });
  return clientNavInFlight;
}

/**
 * Fetch GET /api/character/me (corporation `pathId`, CEO, etc. for desktop menus).
 * @param {string} gameUrl
 * @returns {Promise<object|null>}
 */
function fetchCharacterMe(gameUrl) {
  return getJsonAuthed(gameUrl, '/api/character/me');
}

/**
 * Fetch GET /api/countries for dynamic country configuration.
 * @param {string} gameUrl
 * @returns {Promise<Array<{id: string, executivePath: string, executiveLabel: string, legislaturePath: string, legislatureLabel: string, centralBankName: string, executiveFormation: string, mapPath: string}>|null>}
 */
function fetchCountries(gameUrl) {
  return getJsonAuthed(gameUrl, '/api/countries').then((data) => {
    if (data && Array.isArray(data.countries)) {
      return data.countries;
    }
    return null;
  });
}

/**
 * POST JSON with session cookies.
 * @param {string} gameUrl
 * @param {string} path - e.g. /api/auth/logout
 * @param {object|null} body
 * @returns {Promise<{ statusCode: number, ok: boolean }>}
 */
function postJsonAuthed(gameUrl, path, body) {
  const fullUrl = `${gameUrl}${path.startsWith('/') ? path : `/${path}`}`;
  // Never reject on cookie-store failure — callers expect { statusCode, ok }
  return getCookieHeader(gameUrl)
    .catch(() => '')
    .then(
      (cookieStr) =>
        new Promise((resolve) => {
          const req = net.request({ url: fullUrl, method: 'POST' });
          req.setHeader('Cookie', cookieStr);
          req.setHeader('Content-Type', 'application/json');
          req.setHeader('Accept', 'application/json');
          req.setHeader('X-AHD-Client-Version', CLIENT_VERSION);
          req.on('response', (res) => {
            res.on('data', () => {});
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode || 0,
                ok:
                  res.statusCode != null &&
                  res.statusCode >= 200 &&
                  res.statusCode < 300,
              });
            });
            res.on('error', () => resolve({ statusCode: 0, ok: false }));
          });
          req.on('error', () => resolve({ statusCode: 0, ok: false }));
          if (body != null) req.write(JSON.stringify(body));
          req.end();
        }),
    );
}

/**
 * GET /api/corporations/[id] detail and extract sector ids for bulk wage ops.
 * Requires CEO auth; returns null if detail is unavailable or redacted.
 * @param {string} gameUrl
 * @param {string} corporationId - pathId / sequentialId / _id
 * @returns {Promise<Array<{ _id: string }> | null>}
 */
function fetchCorporationSectorIds(gameUrl, corporationId) {
  const seg = encodeURIComponent(String(corporationId));
  return getJsonAuthed(gameUrl, `/api/corporations/${seg}`).then((data) => {
    if (!data) return null;
    // API returns { sectors: [...] } alongside corporation detail (see AHDGame detail route)
    const sectors = data.sectors || data.corporation?.sectors || [];
    if (!Array.isArray(sectors)) return null;
    return sectors
      .map((s) => {
        const id = s._id || s.id;
        return id ? { _id: String(id) } : null;
      })
      .filter(Boolean);
  });
}

/**
 * POST /api/corporations/[id]/sectors/[sectorId]/wage — set a single sector's wage level.
 * @param {string} gameUrl
 * @param {string} corporationId
 * @param {string} sectorId
 * @param {number} wageLevel - Will be clamped server-side; client also clamps to [0.8, 1.5]
 * @returns {Promise<{ ok: boolean, statusCode: number }>}
 */
function postSectorWage(gameUrl, corporationId, sectorId, wageLevel) {
  const corpSeg = encodeURIComponent(String(corporationId));
  const secSeg = encodeURIComponent(String(sectorId));
  return postJsonAuthed(
    gameUrl,
    `/api/corporations/${corpSeg}/sectors/${secSeg}/wage`,
    {
      wageLevel,
    },
  ).then((r) => ({ ok: r.ok, statusCode: r.statusCode }));
}

module.exports = {
  fetchClientNav,
  fetchCharacterMe,
  fetchCountries,
  postJsonAuthed,
  fetchCorporationSectorIds,
  postSectorWage,
};
