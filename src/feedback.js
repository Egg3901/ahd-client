const { desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('./config');

/**
 * Screenshot and feedback integration.
 * Uses desktopCapturer for native window screenshots,
 * attaches OS/version info to bug reports.
 */

class FeedbackManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
  }

  async captureScreenshot() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null;

    try {
      const image = await this.mainWindow.webContents.capturePage();
      return image.toPNG();
    } catch (err) {
      console.error('Screenshot capture failed:', err);
      return null;
    }
  }

  getSystemInfo() {
    return {
      platform: process.platform,
      arch: process.arch,
      osVersion: os.release(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      appVersion: require('../package.json').version,
      totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
      freeMemory: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
      cpus: os.cpus().length,
    };
  }

  async openFeedbackDialog() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    // Capture screenshot first
    const screenshot = await this.captureScreenshot();
    const systemInfo = this.getSystemInfo();

    // Save screenshot to temp file so the web app can access it
    let screenshotPath = null;
    if (screenshot) {
      screenshotPath = path.join(os.tmpdir(), `ahd-feedback-${Date.now()}.png`);
      fs.writeFileSync(screenshotPath, screenshot);
    }

    // Send feedback data to the renderer to open the feedback modal
    this.mainWindow.webContents.send('open-feedback', {
      screenshotPath,
      systemInfo,
    });

    // Also try to trigger the in-app feedback modal
    this.mainWindow.webContents.executeJavaScript(`
      document.dispatchEvent(new CustomEvent('ahd-open-feedback', {
        detail: ${JSON.stringify({ systemInfo, hasScreenshot: !!screenshot })}
      }));
    `);
  }

  async saveScreenshotDialog() {
    const screenshot = await this.captureScreenshot();
    if (!screenshot) {
      dialog.showErrorBox('Screenshot Failed', 'Could not capture screenshot.');
      return;
    }

    const result = await dialog.showSaveDialog(this.mainWindow, {
      title: 'Save Screenshot',
      defaultPath: `ahd-screenshot-${Date.now()}.png`,
      filters: [{ name: 'PNG Images', extensions: ['png'] }],
    });

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, screenshot);
    }
  }

  setWindow(win) {
    this.mainWindow = win;
  }
}

module.exports = FeedbackManager;
