'use strict';

/**
 * Whether the View menu may offer localhost and useDevServer may apply.
 * Policy: **development build** (`NODE_ENV=development`, e.g. `npm run dev`)
 * **or** a **game admin** (menu `isAdmin`, from client-nav).
 *
 * @param {boolean} [isGameAdmin=false]
 * @returns {boolean}
 */
function isLocalDevServerAllowed(isGameAdmin = false) {
  return process.env.NODE_ENV === 'development' || isGameAdmin === true;
}

module.exports = { isLocalDevServerAllowed };
