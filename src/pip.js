const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Picture-in-Picture / mini-mode for turn countdown.
 * Compact floating widget (~200x80px) that shows game date,
 * time until next turn, and action points.
 */

class PipManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.pipWindow = null;
    this.gameState = {
      currentDate: '',
      nextTurnIn: '',
      actionPoints: '?',
    };
    this.updateInterval = null;
  }

  toggle() {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.close();
    } else {
      this.open();
    }
  }

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

  close() {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.close();
    }
    this.pipWindow = null;
    this.stopUpdates();
  }

  updateGameState(state) {
    Object.assign(this.gameState, state);
    this.updateDisplay();
  }

  updateDisplay() {
    if (!this.pipWindow || this.pipWindow.isDestroyed()) return;

    this.pipWindow.webContents.executeJavaScript(`
      if (typeof updatePip === 'function') {
        updatePip(${JSON.stringify(this.gameState)});
      }
    `);
  }

  expandToFull() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
    this.close();
  }

  startUpdates() {
    // Refresh display every 10 seconds
    this.updateInterval = setInterval(() => this.updateDisplay(), 10000);
  }

  stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  isOpen() {
    return this.pipWindow && !this.pipWindow.isDestroyed();
  }

  setWindow(win) {
    this.mainWindow = win;
  }

  destroy() {
    this.close();
    this.stopUpdates();
  }
}

module.exports = PipManager;
