const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

/**
 * Auto-updater tied to deployment.
 * Uses electron-updater to check for updates.
 * Prompts user with changelog and update options.
 */

class UpdateManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow
   */
  constructor(mainWindow) {
    /** @type {Electron.BrowserWindow} */
    this.mainWindow = mainWindow;
    /** @type {boolean} */
    this.updateAvailable = false;
    /** @type {boolean} */
    this.updateReady = false;
    /** @type {object|null} */
    this.updateInfo = null;
    /** @type {((info: object) => void)|null} */
    this.onUpdateAvailable = null;
    /** @type {((info: object) => void)|null} */
    this.onUpdateReady = null;
    /** @type {boolean} True while a download is in flight (guards re-entry). */
    this._downloading = false;

    // Don't auto-download — let user decide
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupListeners();
  }

  /** @private */
  setupListeners() {
    autoUpdater.on('checking-for-update', () => {
      this.sendStatus('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      this.updateAvailable = true;
      this.updateInfo = info;
      if (this.onUpdateAvailable) this.onUpdateAvailable(info);
      this.promptUpdate(info);
    });

    autoUpdater.on('update-not-available', () => {
      this.sendStatus('Up to date.');
    });

    autoUpdater.on('download-progress', (progress) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setProgressBar(progress.percent / 100);
      }
      this.sendStatus(`Downloading update: ${Math.round(progress.percent)}%`);
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.updateReady = true;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setProgressBar(-1);
      }
      if (this.onUpdateReady) this.onUpdateReady(info);
      this.promptInstall(info);
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      this.sendStatus('Update check failed.');
    });
  }

  /** Trigger a check for available updates. Safe to call repeatedly. */
  checkForUpdates() {
    try {
      autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  }

  /**
   * Show a dialog asking the user to download the update.
   * @param {{version: string, releaseNotes?: string}} info
   * @private
   */
  async promptUpdate(info) {
    const version = info.version || 'unknown';
    const releaseNotes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : 'See changelog for details.';

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${version}) is available.`,
      detail: `${releaseNotes}\n\nWould you like to download it now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      this.startDownload();
    }
  }

  /**
   * Download the pending update with visible failure feedback.
   * `downloadUpdate()` used to be fire-and-forget: on a flaky connection the
   * promise rejected silently, the "Downloading…" taskbar progress vanished,
   * and the user was left waiting forever after clicking Download.
   * @private
   * @returns {void}
   */
  startDownload() {
    if (this._downloading || this.updateReady) return;
    this._downloading = true;
    // Promise.resolve(): never blow up if downloadUpdate() returns
    // non-promise (older electron-updater versions).
    Promise.resolve(autoUpdater.downloadUpdate())
      .catch((err) => {
        console.error('Update download failed:', err?.message || err);
        this.sendStatus('Update download failed.');
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          dialog
            .showMessageBox(this.mainWindow, {
              type: 'error',
              title: 'Update Failed',
              message: 'The update could not be downloaded.',
              detail:
                `${err?.message || err}\n\n` +
                'Check your internet connection and restart the app to try again.',
              buttons: ['OK'],
            })
            .catch(() => {});
        }
      })
      .finally(() => {
        this._downloading = false;
      });
  }

  /**
   * Show a dialog asking the user to restart and install the downloaded update.
   * @param {{version: string}} info
   * @private
   */
  async promptInstall(info) {
    const version = info.version || 'unknown';

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${version} has been downloaded.`,
      detail: 'The update will be installed when you restart the app.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      // isForceRunAfter=true: relaunch the freshly installed build. The
      // default (false) installs silently and leaves the app CLOSED, which
      // reads as "the update ate my app" to the user who clicked Restart Now.
      autoUpdater.quitAndInstall(false, true);
    }
  }

  /**
   * Send an update status message to the renderer.
   * @param {string} message
   * @private
   */
  sendStatus(message) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', message);
    }
  }

  /** @param {Electron.BrowserWindow} win */
  setWindow(win) {
    this.mainWindow = win;
  }
}

module.exports = UpdateManager;
