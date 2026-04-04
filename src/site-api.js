'use strict';

const { session, net } = require('electron');

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
  return getCookieHeader(gameUrl).then(
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

        let body = '';
        req.on('response', (res) => {
          res.on('data', (chunk) => {
            if (settled) return;
            body += chunk.toString();
            if (Buffer.byteLength(body, 'utf8') > MAX_JSON_BYTES) {
              res.destroy();
              done(null);
            }
          });
          res.on('end', () => {
            if (settled) return;
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
 * Fetch GET /api/character/me for corporation sequentialId (World → My Corporation).
 * @param {string} gameUrl
 * @returns {Promise<object|null>}
 */
function fetchCharacterMe(gameUrl) {
  return getJsonAuthed(gameUrl, '/api/character/me');
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
  return getCookieHeader(gameUrl).then(
    (cookieStr) =>
      new Promise((resolve) => {
        const req = net.request({ url: fullUrl, method: 'POST' });
        req.setHeader('Cookie', cookieStr);
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Accept', 'application/json');
        req.on('response', (res) => {
          res.on('data', () => {});
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 0,
              ok: res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300,
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

module.exports = {
  fetchClientNav,
  fetchCharacterMe,
  postJsonAuthed,
};
