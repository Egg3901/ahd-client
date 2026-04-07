'use strict';

function stripTrailingSlash(url) {
  return String(url || '').replace(/\/$/, '');
}

/**
 * When set, the client always uses this origin; sandbox toggle is disabled.
 * Use for local development (e.g. http://localhost:3000).
 */
const ENV_GAME_URL = process.env.AHD_GAME_URL
  ? stripTrailingSlash(process.env.AHD_GAME_URL)
  : null;

const MAIN_GAME_URL = stripTrailingSlash(
  process.env.AHD_MAIN_GAME_URL || 'https://www.ahousedividedgame.com',
);

const SANDBOX_GAME_URL = stripTrailingSlash(
  process.env.AHD_SANDBOX_GAME_URL || 'https://test.ahousedividedgame.com',
);

/** Default when View → “local dev” is enabled (`npm run dev` only). */
const DEV_GAME_URL = stripTrailingSlash(
  process.env.AHD_DEV_GAME_URL || 'http://localhost:3000',
);

/**
 * @param {boolean} useSandbox — ignored when ENV_GAME_URL is set
 * @returns {string}
 */
function getActiveGameUrl(useSandbox) {
  if (ENV_GAME_URL) return ENV_GAME_URL;
  return useSandbox ? SANDBOX_GAME_URL : MAIN_GAME_URL;
}

function isEnvGameUrlOverride() {
  return !!ENV_GAME_URL;
}

/**
 * Bare hostnames (no www) for main and sandbox, plus env URL if set.
 * @returns {string[]}
 */
function trustedGameHostsBare() {
  const out = [];
  for (const u of [MAIN_GAME_URL, SANDBOX_GAME_URL]) {
    try {
      out.push(new URL(u).hostname.replace(/^www\./i, '').toLowerCase());
    } catch {
      /* ignore */
    }
  }
  if (ENV_GAME_URL) {
    try {
      out.push(
        new URL(ENV_GAME_URL).hostname.replace(/^www\./i, '').toLowerCase(),
      );
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * Whether a URL’s host is main, sandbox, or env game origin (including www).
 * @param {string} urlString
 * @returns {boolean}
 */
function isTrustedGameUrl(urlString) {
  try {
    const { hostname } = new URL(urlString);
    const bare = hostname.replace(/^www\./i, '').toLowerCase();
    if (bare === 'localhost' || bare === '127.0.0.1') return true;
    return trustedGameHostsBare().includes(bare);
  } catch {
    return false;
  }
}

module.exports = {
  MAIN_GAME_URL,
  SANDBOX_GAME_URL,
  DEV_GAME_URL,
  ENV_GAME_URL,
  getActiveGameUrl,
  isEnvGameUrlOverride,
  isTrustedGameUrl,

  // Window defaults
  WINDOW_WIDTH: 1280,
  WINDOW_HEIGHT: 800,
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600,

  // Auto-updater
  UPDATE_CHECK_INTERVAL: 60 * 60 * 1000, // 1 hour

  /**
   * Alias for main-game URL when no sandbox preference (tests, legacy).
   * Prefer activeGameUrl.get() in the main process at runtime.
   */
  get GAME_URL() {
    return getActiveGameUrl(false);
  },
};
