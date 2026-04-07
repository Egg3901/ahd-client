const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const activeGameUrl = require('./active-game-url');
const PipViewPoller = require('./pip-view-poller');

const MIN_W = 260;
const MIN_H = 180;
/** Default window size when no stored bounds */
const DEFAULT_BOUNDS = { width: 360, height: 420 };

const DEFAULT_BAR_STATS = [
  'ap',
  'funds',
  'cash',
  'portfolio',
  'pi',
  'fav',
  'nationalInfluence',
  'turn',
];

const DEFAULT_CUSTOM_PANELS = [
  'my-status',
  'my-election',
  'notifications',
  'legislature',
];

const VIEW_ORDER = ['standard', 'corp', 'elections', 'global', 'custom'];

class PipManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow
   * @param {import('./cache')|null} cacheManager
   */
  constructor(mainWindow, cacheManager = null) {
    /** @type {Electron.BrowserWindow} */
    this.mainWindow = mainWindow;
    /** @type {import('./cache')|null} */
    this._cache = cacheManager;
    /** @type {Electron.BrowserWindow|null} */
    this.pipWindow = null;

    /** Dashboard-mapped fields for the persistent stat bar */
    this.barState = this._emptyBarState();

    /** Payloads from PipViewPoller keyed by view (custom holds merged bundles) */
    this.viewState = {
      standard: null,
      corp: null,
      elections: null,
      global: null,
      custom: null,
    };

    /** @type {'standard'|'corp'|'elections'|'global'|'custom'} */
    this.activeView = 'standard';

    /** @type {PipViewPoller|null} */
    this.viewPoller = null;

    this.updateInterval = null;
    /** @type {NodeJS.Timeout|null} */
    this._boundsSaveTimer = null;

    this._hydrateFromStore();
    this._registerIpc();
  }

  /** @private */
  _emptyBarState() {
    return {
      currentDate: '',
      nextTurnIn: '',
      actionPoints: null,
      maxActionPoints: 15,
      funds: null,
      cashOnHand: null,
      portfolioValue: null,
      portfolioChangePercent: null,
      cashOnHandChangePercent: null,
      projectedIncome: null,
      incomeBreakdown: null,
      politicalInfluence: null,
      politicalInfluenceDecayWarning: false,
      favorability: null,
      favorabilityDecayWarning: false,
      infamy: null,
      infamyDecayWarning: false,
      nationalInfluence: null,
      hasCorp: null,
      electionDate: null,
      electionName: null,
      electionIsCandidate: false,
      turnsUntilElection: null,
      unreadMailCount: null,
      politicalInfluenceProjected: null,
      politicalInfluenceDecaying: false,
      favorabilityProjected: null,
      favorabilityDecaying: false,
      actionCosts: {
        fundraise: 1,
        advertise: 2,
        donorBuild: 3,
        poll: 1,
        campaign: 2,
      },
    };
  }

  /** @private */
  _pipStore() {
    const raw = this._cache?.getPreference('pip');
    return raw && typeof raw === 'object' ? raw : {};
  }

  /** @private */
  _setPipStore(partial) {
    if (!this._cache) return;
    const cur = this._pipStore();
    this._cache.setPreference('pip', { ...cur, ...partial });
  }

  /** @private */
  _hydrateFromStore() {
    const p = this._pipStore();
    if (p.activeView && VIEW_ORDER.includes(p.activeView)) {
      this.activeView = p.activeView;
    }
  }

  get barStatsOrder() {
    const p = this._pipStore();
    const s = p.barStats;
    if (Array.isArray(s) && s.length > 0) return s;
    return [...DEFAULT_BAR_STATS];
  }

  get customPanels() {
    const p = this._pipStore();
    const c = p.customPanels;
    if (Array.isArray(c) && c.length > 0) return c;
    return [...DEFAULT_CUSTOM_PANELS];
  }

  /** Refresh PiP after Status Bar prefs change in the config window. */
  applyBarStatsFromStore() {
    this.updateDisplay();
  }

  // ── IPC ──

  /** @private */
  _registerIpc() {
    this._onOpenMain = () => this.expandToFull();
    this._onCycleView = () => {
      this.cycleView();
      return this.activeView;
    };
    this._onSetCustomPanels = (_e, panels) => {
      if (!Array.isArray(panels)) return { ok: false };
      this._setPipStore({ customPanels: panels });
      if (this.viewPoller) this.viewPoller.fetchNow();
      this.updateDisplay();
      return { ok: true };
    };
    /** Deep-link main window to a game path (PiP stays open). */
    this._onNavigate = (_e, route) => {
      const r = String(route || '').trim();
      if (!r.startsWith('/')) return;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.loadURL(`${activeGameUrl.get()}${r}`);
      }
    };

    ipcMain.on('pip-open-main', this._onOpenMain);
    ipcMain.on('pip-navigate', this._onNavigate);
    ipcMain.handle('pip-cycle-view', this._onCycleView);
    ipcMain.handle('pip-set-custom-panels', this._onSetCustomPanels);
  }

  /** @private */
  _unregisterIpc() {
    ipcMain.off('pip-open-main', this._onOpenMain);
    ipcMain.off('pip-navigate', this._onNavigate);
    ipcMain.removeHandler('pip-cycle-view');
    ipcMain.removeHandler('pip-set-custom-panels');
  }

  /** @private */
  _scheduleSaveBounds() {
    if (!this.pipWindow || this.pipWindow.isDestroyed()) return;
    if (this._boundsSaveTimer) clearTimeout(this._boundsSaveTimer);
    this._boundsSaveTimer = setTimeout(() => {
      this._boundsSaveTimer = null;
      if (!this.pipWindow || this.pipWindow.isDestroyed()) return;
      this._setPipStore({ bounds: this.pipWindow.getBounds() });
    }, 400);
  }

  /** @private */
  _applyWindowBounds() {
    if (!this.pipWindow || this.pipWindow.isDestroyed()) return;
    const b = this._pipStore().bounds;
    if (b && b.width >= MIN_W && b.height >= MIN_H) {
      this.pipWindow.setBounds({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
      });
    } else {
      this.pipWindow.setSize(
        DEFAULT_BOUNDS.width,
        DEFAULT_BOUNDS.height,
        false,
      );
    }
  }

  // ── Lifecycle ──

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

    this._hydrateFromStore();

    this.pipWindow = new BrowserWindow({
      width: DEFAULT_BOUNDS.width,
      height: DEFAULT_BOUNDS.height,
      minWidth: MIN_W,
      minHeight: MIN_H,
      maxWidth: 10000,
      maxHeight: 10000,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
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

    this._applyWindowBounds();

    this.pipWindow.loadFile(path.join(__dirname, 'pip.html'));

    const saveBounds = () => this._scheduleSaveBounds();
    this.pipWindow.on('resize', saveBounds);
    this.pipWindow.on('move', saveBounds);
    this.pipWindow.on('closed', () => {
      const w = this.pipWindow;
      if (w && !w.isDestroyed()) {
        w.removeListener('resize', saveBounds);
        w.removeListener('move', saveBounds);
      }
      this.pipWindow = null;
      this.stopUpdates();
      this._stopViewPolling();
    });

    this.pipWindow.webContents.on('did-finish-load', () => {
      this.updateDisplay();
    });

    this.startUpdates();
    this._startViewPolling();
  }

  close() {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.close();
    }
    this.pipWindow = null;
    this.stopUpdates();
    this._stopViewPolling();
  }

  // ── State updates ──

  /**
   * Merge dashboard-mapped fields into the bar (from DashboardPoller).
   * @param {object} state
   */
  updateBarState(state) {
    Object.assign(this.barState, state);
    if (this.activeView === 'corp' && this.barState.hasCorp === false) {
      this.activeView = 'standard';
      this._setPipStore({ activeView: 'standard' });
      if (this.viewPoller) this.viewPoller.setView('standard');
    }
    this.updateDisplay();
  }

  /**
   * @param {'standard'|'corp'|'elections'|'global'|'custom'} viewName
   * @param {object} data
   */
  updateViewState(viewName, data) {
    if (viewName === 'custom') {
      this.viewState.custom = data;
    } else {
      this.viewState[viewName] = data;
    }
    this.updateDisplay();
  }

  cycleView() {
    const hasCorp = this.barState.hasCorp === true;
    let idx = VIEW_ORDER.indexOf(this.activeView);
    if (idx < 0) idx = 0;
    for (let step = 0; step < VIEW_ORDER.length; step++) {
      idx = (idx + 1) % VIEW_ORDER.length;
      const next = VIEW_ORDER[idx];
      if (next === 'corp' && !hasCorp) continue;
      this.activeView = next;
      break;
    }
    this._setPipStore({ activeView: this.activeView });
    if (this.viewPoller) this.viewPoller.setView(this.activeView);
    this.updateDisplay();
  }

  /** @private */
  _startViewPolling() {
    this._stopViewPolling();
    this.viewPoller = new PipViewPoller(
      () => this.customPanels,
      (viewName, data) => this.updateViewState(viewName, data),
    );
    this.viewPoller.setView(this.activeView);
    this.viewPoller.start();
  }

  /** @private */
  _stopViewPolling() {
    if (this.viewPoller) {
      this.viewPoller.stop();
      this.viewPoller = null;
    }
  }

  /** @private */
  updateDisplay() {
    if (!this.pipWindow || this.pipWindow.isDestroyed()) return;
    const payload = {
      bar: this.barState,
      views: this.viewState,
      activeView: this.activeView,
      barStats: this.barStatsOrder,
      customPanels: this.customPanels,
    };
    const json = JSON.stringify(payload);
    this.pipWindow.webContents.executeJavaScript(`
      if (typeof updatePip === 'function') {
        updatePip(${json});
      }
    `);
  }

  // ── Window control ──

  expandToFull() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
    this.close();
  }

  // ── Interval (bar timer refresh) ──

  /** @private */
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

  isOpen() {
    return !!(this.pipWindow && !this.pipWindow.isDestroyed());
  }

  /** @param {Electron.BrowserWindow} win */
  setWindow(win) {
    this.mainWindow = win;
  }

  destroy() {
    this.close();
    this.stopUpdates();
    if (this._boundsSaveTimer) clearTimeout(this._boundsSaveTimer);
    this._unregisterIpc();
  }
}

module.exports = PipManager;
