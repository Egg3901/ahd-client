/**
 * Safe wrapper around webContents.loadURL.
 *
 * loadURL returns a promise that rejects on aborted / failed navigations
 * (e.g. ERR_ABORTED when a newer load supersedes it, or certificate/TLS
 * errors). A floating loadURL call therefore surfaces as an unhandled
 * promise rejection and can crash the main process. This helper guards a
 * destroyed webContents and swallows the rejection — the visible failure is
 * handled separately by the `did-fail-load` overlay in main.js.
 */

/**
 * Chromium error descriptions that indicate a TLS/certificate problem.
 * Matched against the `errorDescription` from `did-fail-load`.
 */
const CERT_ERROR_PATTERN = /CERT|SSL|certificate/i;

/**
 * Load a URL into a webContents without throwing or leaving a floating
 * rejection. No-ops when the target is gone.
 * @param {import('electron').WebContents|null|undefined} webContents
 * @param {string} url
 * @returns {void}
 */
function safeLoadURL(webContents, url) {
  if (!webContents || webContents.isDestroyed()) return;
  Promise.resolve(webContents.loadURL(url)).catch((err) => {
    // ERR_ABORTED (-3) is expected when a newer navigation supersedes this
    // one; anything else is logged for diagnostics. The user-facing overlay
    // is driven by the 'did-fail-load' handler, not here.
    const message = err?.message || String(err);
    if (!message.includes('ERR_ABORTED')) {
      console.error('[safeLoadURL] navigation failed:', message);
    }
  });
}

module.exports = { safeLoadURL, CERT_ERROR_PATTERN };
