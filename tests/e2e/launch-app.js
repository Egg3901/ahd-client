const { _electron: electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Launch the app under test with an isolated user-data directory.
 *
 * Electron resolves the default userData path from package.json "name"
 * ("ahd-client") — the SAME path the installed production app uses. Without
 * an override, requestSingleInstanceLock() in src/main.js fails whenever the
 * real AHD client is running on the machine and the test process quits
 * immediately with exit code 0, so electron.launch() reports
 * "Process failed to launch!". A per-run temp profile also keeps e2e runs
 * from reading or clobbering the real app's cache and preferences.
 * @returns {Promise<import('playwright').ElectronApplication>}
 */
async function launchApp() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahd-e2e-'));
  return electron.launch({
    args: [
      path.join(__dirname, '..', '..', '.'),
      `--user-data-dir=${userDataDir}`,
    ],
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });
}

module.exports = { launchApp };
