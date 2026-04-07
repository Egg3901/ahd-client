'use strict';

const config = require('./config');
const { isLocalDevServerAllowed } = require('./game-server-dev');

/** @type {import('./cache') | null} */
let cacheManager = null;

/** Whether localhost is allowed (set from main: dev build or site admin). */
/** @type {() => boolean} */
let isAdminProvider = () => false;

/**
 * Call once after CacheManager is constructed so get() respects useSandboxServer.
 * @param {import('./cache')} cm
 */
function bindCache(cm) {
  cacheManager = cm;
}

/**
 * @param {() => boolean} fn - true when the signed-in user is a game admin (DB-backed in menu).
 */
function setAdminProvider(fn) {
  isAdminProvider = typeof fn === 'function' ? fn : () => false;
}

function devServerAllowed() {
  return isLocalDevServerAllowed(isAdminProvider());
}

/**
 * Public game origin for the current session (env override → local dev → sandbox vs main).
 * @returns {string}
 */
function get() {
  if (config.ENV_GAME_URL) return config.ENV_GAME_URL;
  if (
    cacheManager != null &&
    cacheManager.getPreference('useDevServer') === true &&
    devServerAllowed()
  ) {
    return config.DEV_GAME_URL;
  }
  const useSandbox =
    cacheManager != null &&
    cacheManager.getPreference('useSandboxServer') === true;
  return config.getActiveGameUrl(useSandbox);
}

module.exports = { bindCache, get, setAdminProvider, devServerAllowed };
