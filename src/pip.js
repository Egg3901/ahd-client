const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

/**
 * Turn Dashboard Widget (mini-mode).
 * Compact always-on-top floating window showing live game state:
 *   - AP bar with per-action affordability counts
 *   - Fund balance + projected net income
 *   - PI / Favorability / Infamy with decay warnings
 *   - Nearest election countdown
 *   - Expandable detail panel (income breakdown, stat detail, election name)
 *
 * Compact size: 310×175  Expanded size: 340×340
 */

const COMPACT = { width: 310, height: 175, minW: 260, maxW: 460, maxH: 200 };
const EXPANDED = { width: 340, height: 340, minW: 290, maxW: 520, maxH: 440 };

class PipManager {
  /** @param {Electron.BrowserWindow} mainWindow */
  constructor(mainWindow) {
    /** @type {Electron.BrowserWindow} */
    this.mainWindow = mainWindow;
    /** @type {Electron.BrowserWindow|null} */
    this.pipWindow = null;
    /** @type {boolean} */
    this.isExpanded = false;

    /**
     * Full game state passed to the dashboard.
     * Fields marked (*) are new vs. the original 3-stat PiP.
     * @type {object}
     */
    this.gameState = {
      // Core (original)
      currentDate: '',
      nextTurnIn: '',
      actionPoints: null,
      // (*) AP ceiling — default 15 until server overrides
      maxActionPoints: 15,
      // (*) Funds & income
      funds: null,
      projectedIncome: null,
      incomeBreakdown: null, // { base, donorBonus, officeSalary, partyTax }
      // (*) Decay stats
      politicalInfluence: null,
      politicalInfluenceDecayWarning: false,
      favorability: null,
      favorabilityDecayWarning: false,
      infamy: null,
      infamyDecayWarning: false,
      // (*) Election countdown
      electionDate: null,
      electionName: null,
      // (*) Per-action AP costs (server may override)
      actionCosts: { fundraise: 1, advertise: 2, donorBuild: 3, poll: 1 },
    };

    this.updateInterval = null;
    this._registerIpc();
  }

  // ── IPC from pip-preload.js ──

  /** @private Register IPC handlers for the pip window's bridge calls. */
  _registerIpc() {
    this._onOpenMain = () => this.expandToFull();
    this._onSetExpanded = (_, expanded) => {
      this.isExpanded = expanded;
      this._applySize();
    };
    ipcMain.on('pip-open-main', this._onOpenMain);
    ipcMain.on('pip-set-expanded', this._onSetExpanded);
  }

  /** @private Resize the window to match the current expanded state. */
  _applySize() {
    if (!this.pipWindow || this.pipWindow.isDestroyed()) return;
    const s = this.isExpanded ? EXPANDED : COMPACT;
    this.pipWindow.setMinimumSize(s.minW ?? s.width, s.height);
    this.pipWindow.setMaximumSize(s.maxW, s.maxH);
    this.pipWindow.setSize(s.width, s.height, true /* animate on macOS */);
  }

  // ── Lifecycle ──

  /** Toggle the PiP window open/closed. */
  toggle() {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Create and show the PiP dashboard window. */
  open() {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.focus();
      return;
    }

    this.isExpanded = false;

    this.pipWindow = new BrowserWindow({
      width: COMPACT.width,
      height: COMPACT.height,
      minWidth: COMPACT.minW ?? COMPACT.width,
      minHeight: COMPACT.height,
      maxWidth: COMPACT.maxW,
      maxHeight: COMPACT.maxH,
      alwaysOnTop: true,
      frame: false,
      transparent: false,
      resizable: true,
      skipTaskbar: true,
      title: 'AHD Dashboard',
      webPreferences: {
        preload: path.join(__dirname, 'pip-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.pipWindow.loadFile(path.join(__dirname, 'pip.html'));

    this.pipWindow.on('closed', () => {
      this.pipWindow = null;
      this.isExpanded = false;
      this.stopUpdates();
    });

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

  // ── State updates ──

  /**
   * Merge new game state fields and refresh the dashboard.
   * Accepts any subset of the fields tracked by gameState.
   * @param {object} state
   */
  updateGameState(state) {
    Object.assign(this.gameState, state);
    this.updateDisplay();
  }

  /** @private Push current game state to the HTML via executeJavaScript. */
  updateDisplay() {
    if (!this.pipWindow || this.pipWindow.isDestroyed()) return;
    this.pipWindow.webContents.executeJavaScript(`
      if (typeof updatePip === 'function') {
        updatePip(${JSON.stringify(this.gameState)});
      }
    `);
  }

  // ── Window control ──

  /** Close PiP and bring the main window to front. */
  expandToFull() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
    this.close();
  }

  // ── Interval ──

  /** @private Refresh every 10 s so timers stay live. */
  startUpdates() {
    this.updateInterval = setInterval(() => this.updateDisplay(), 10000);
  }

  /** @private */
  stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // ── Queries ──

  /** @returns {boolean} */
  isOpen() {
    return !!(this.pipWindow && !this.pipWindow.isDestroyed());
  }

  /** @param {Electron.BrowserWindow} win */
  setWindow(win) {
    this.mainWindow = win;
  }

  /** Close PiP window, stop timers, and remove IPC handlers. */
  destroy() {
    this.close();
    this.stopUpdates();
    ipcMain.off('pip-open-main', this._onOpenMain);
    ipcMain.off('pip-set-expanded', this._onSetExpanded);
  }
}

module.exports = PipManager;
