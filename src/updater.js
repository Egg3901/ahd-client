const { autoUpdater } = require('electron-updater');
const { dialog, BrowserWindow } = require('electron');

/**
 * Auto-updater tied to deployment.
 * Uses electron-updater to check for updates.
 * Prompts user with changelog and update options.
 */

class UpdateManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.updateAvailable = false;
    this.updateInfo = null;

    // Don't auto-download — let user decide
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupListeners();
  }

  setupListeners() {
    autoUpdater.on('checking-for-update', () => {
      this.sendStatus('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      this.updateAvailable = true;
      this.updateInfo = info;
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
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setProgressBar(-1);
      }
      this.promptInstall(info);
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      this.sendStatus('Update check failed.');
    });
  }

  checkForUpdates() {
    try {
      autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  }

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
      autoUpdater.downloadUpdate();
    }
  }

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
      autoUpdater.quitAndInstall();
    }
  }

  sendStatus(message) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', message);
    }
  }

  setWindow(win) {
    this.mainWindow = win;
  }
}

module.exports = UpdateManager;
