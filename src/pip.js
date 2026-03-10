const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Picture-in-Picture / mini-mode for turn countdown.
 * Compact floating widget (~200x80px) that shows game date,
 * time until next turn, and action points.
 */

class PipManager {
  /** @param {Electron.BrowserWindow} mainWindow */
  constructor(mainWindow) {
    /** @type {Electron.BrowserWindow} */
    this.mainWindow = mainWindow;
    /** @type {Electron.BrowserWindow|null} */
    this.pipWindow = null;
    /** @type {{currentDate: string, nextTurnIn: string, actionPoints: string|number}} */
    this.gameState = {
      currentDate: '',
      nextTurnIn: '',
      actionPoints: '?',
    };
    this.updateInterval = null;
  }

  /** Toggle the PiP window open/closed. */
  toggle() {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Create and show the PiP mini-mode window. */
  open() {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.focus();
      return;
    }

    this.pipWindow = new BrowserWindow({
      width: 280,
      height: 100,
      minWidth: 200,
      minHeight: 80,
      maxWidth: 400,
      maxHeight: 150,
      alwaysOnTop: true,
      frame: false,
      transparent: false,
      resizable: true,
      skipTaskbar: true,
      title: 'AHD Mini',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.pipWindow.loadFile(path.join(__dirname, 'pip.html'));

    this.pipWindow.on('closed', () => {
      this.pipWindow = null;
      this.stopUpdates();
    });

    // Click to expand to full app
    this.pipWindow.webContents.on('did-finish-load', () => {
      this.updateDisplay();
    });

    this.startUpdates();
  }

  /** Close the PiP window if open. */
  close() {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.close();
    }
    this.pipWindow = null;
    this.stopUpdates();
  }

  /**
   * Merge new game state and refresh the PiP display.
   * @param {{currentDate?: string, nextTurnIn?: string, actionPoints?: number}} state
   */
  updateGameState(state) {
    Object.assign(this.gameState, state);
    this.updateDisplay();
  }

  /** @private Push current game state to the PiP HTML */
  updateDisplay() {
    if (!this.pipWindow || this.pipWindow.isDestroyed()) return;

    this.pipWindow.webContents.executeJavaScript(`
      if (typeof updatePip === 'function') {
        updatePip(${JSON.stringify(this.gameState)});
      }
    `);
  }

  /** Close PiP and bring the main window to front. */
  expandToFull() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
    this.close();
  }

  /** @private Start the 10-second display refresh interval. */
  startUpdates() {
    // Refresh display every 10 seconds
    this.updateInterval = setInterval(() => this.updateDisplay(), 10000);
  }

  /** @private */
  stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /** @returns {boolean} */
  isOpen() {
    return this.pipWindow && !this.pipWindow.isDestroyed();
  }

  /** @param {Electron.BrowserWindow} win */
  setWindow(win) {
    this.mainWindow = win;
  }

  /** Close PiP window and clean up timers. */
  destroy() {
    this.close();
    this.stopUpdates();
  }
}

module.exports = PipManager;
