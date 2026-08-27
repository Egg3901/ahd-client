const { Menu, session, shell, clipboard, app, dialog } = require('electron');
const activeGameUrl = require('./active-game-url');
const siteApi = require('./site-api');
const urls = require('./urls');
const {
  getStateLegislatureLabel,
  getStatePartyLinkAdjective,
} = require('./uk-state-labels');
const { getNavForCountry } = require('./nav');
const { buildGamePanelMenuTemplate } = require('./game-panel-links');
const { safeLoadURL } = require('./safe-load-url');
const {
  WAGE_PRESETS,
  WAGE_PRESET_LABELS,
  BULK_WAGE_MAX_PER_WINDOW,
  clampWageLevel,
  formatWageLevel,
  validateCanAdjustWages,
  bulkSetWageLevel,
  estimateBulkWageDurationMs,
  formatDuration,
} = require('./corporation-wages');

/**
 * Custom application menu replacing the default Electron menu.
 * Game-aware menus: Game, Navigate, Account (when signed in), Admin (conditional), View, Help.
 * Navigate link groups match the focused-view navbar spec (Profile → World).
 */

/** @type {{id: string, label: string}[]} The site's available themes */
const THEMES = [
  { id: 'auto', label: 'Auto (follows OS)' },
  { id: 'default', label: 'Default' },
  { id: 'light', label: 'Light' },
  { id: 'oled', label: 'OLED' },
  { id: 'usa', label: 'USA' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'dark-pastel', label: 'Dark Pastel' },
  { id: 'solarized', label: 'Solarized' },
];

class MenuManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow
   * @param {import('./windows')} windowManager - For pop-out window presets
   * @param {{onThemeChange?: (id: string) => void, onTogglePip?: () => void, onOpenFeedback?: () => void, onToggleFocusedMode?: (enabled: boolean) => void, onOpenGamePanelConfig?: () => void, isAdmin?: boolean, isFocusedMode?: boolean, cacheManager?: import('./cache')}} [options]
   */
  constructor(mainWindow, windowManager, options = {}) {
    /** @type {Electron.BrowserWindow} */
    this.mainWindow = mainWindow;
    /** @type {import('./windows')} */
    this.windowManager = windowManager;
    /** @type {boolean} */
    this.isAdmin = options.isAdmin || false;
    /** @type {boolean} */
    this.isFocusedMode = options.isFocusedMode !== false;
    /** @type {((id: string) => void)|null} */
    this.onThemeChange = options.onThemeChange || null;
    /** @type {(() => void)|null} */
    this.onTogglePip = options.onTogglePip || null;
    /** @type {(() => void)|null} */
    this.onOpenFeedback = options.onOpenFeedback || null;
    /** @type {((enabled: boolean) => void)|null} */
    this.onToggleFocusedMode = options.onToggleFocusedMode || null;
    /** @type {(() => void)|null} Set externally by main.js for dev event log */
    this.onOpenEventLog = null;
    /** @type {(() => void)|null} */
    this.onOpenGamePanelConfig = options.onOpenGamePanelConfig || null;
    /** @type {import('./cache')|null} */
    this.cacheManager = options.cacheManager || null;
    /** @type {object} Current country nav config */
    this.nav = getNavForCountry(null);
    /** @type {object|null} Latest client-nav manifest */
    this.manifest = null;
    /** @type {{ envOverride: boolean, useSandbox: boolean, useDevServer?: boolean, showDevToggle?: boolean, onSwitch: (useSandbox: boolean) => void, onSwitchDev?: (useDev: boolean) => void, onUseStandardServer?: () => void }|undefined} */
    this.gameServer = options.gameServer;
  }

  /**
   * Build and set the application menu from all submenus.
   * Call again after setAdmin() to refresh.
   */
  build() {
    const template = [
      this.gameMenu(),
      this.navigateMenu(),
      ...(this.manifest?.user ? [this.accountMenu()] : []),
      ...(this.isAdmin ? [this.adminMenu()] : []),
      this.viewMenu(),
      this.helpMenu(),
    ];

    if (process.env.NODE_ENV === 'development') {
      template.push(this.devMenu());
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  gameMenu() {
    const manifest = this.manifest || {};
    const stored = this.cacheManager
      ? this.cacheManager.getPreference('gamePanelEntries')
      : null;
    const quickLinks = buildGamePanelMenuTemplate(manifest, stored, (route) =>
      this.navigate(route),
    );
    /** @type {Electron.MenuItemConstructorOptions[]} */
    const submenu = [
      ...quickLinks,
      {
        label: 'Actions',
        click: () => this.navigate('/actions'),
      },
      {
        label: 'Copy current link',
        accelerator: 'CmdOrCtrl+Shift+U',
        click: () => {
          if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
          try {
            const url = this.mainWindow.webContents.getURL();
            if (url) clipboard.writeText(url);
          } catch {
            /* ignore */
          }
        },
      },
    ];
    if (this.onOpenGamePanelConfig) {
      submenu.push({
        label: 'Customize Game Panel…',
        click: () => this.onOpenGamePanelConfig(),
      });
    }
    submenu.push({ type: 'separator' });
    submenu.push(
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => this.reloadMainWindow(),
      },
      {
        label: 'Go Home',
        accelerator: 'CmdOrCtrl+H',
        click: () => this.navigate('/'),
      },
      { type: 'separator' },
      {
        label: 'Clear Cache & Reload',
        click: async () => {
          if (!this.canNavigate()) return;
          const ses = session.fromPartition('persist:ahd');
          try {
            await ses.clearCache();
          } catch (err) {
            console.error('Failed to clear cache:', err?.message || err);
          }
          // The window may have been closed while clearing the cache
          if (!this.canNavigate()) return;
          safeLoadURL(this.mainWindow.webContents, activeGameUrl.get());
        },
      },
      { type: 'separator' },
      { role: 'quit' },
    );
    return {
      label: 'Game',
      submenu,
    };
  }

  /**
   * Account: Profile Settings, Admin Panel, Sign Out, changelog footer (spec §F).
   */
  accountMenu() {
    const user = this.manifest?.user;
    if (!user) return { label: 'Account', submenu: [] };
    const pkg = require('../package.json');
    const items = [
      { label: 'Profile Settings', click: () => this.navigate('/settings') },
    ];
    if (user.isAdmin) {
      items.push({
        label: 'Admin Panel',
        click: () => this.navigate('/admin'),
      });
    }
    items.push(
      { type: 'separator' },
      {
        label: 'Sign Out',
        click: async () => {
          await siteApi.postJsonAuthed(
            activeGameUrl.get(),
            '/api/auth/logout',
            null,
          );
          if (this.canNavigate()) {
            safeLoadURL(this.mainWindow.webContents, `${activeGameUrl.get()}/`);
          }
        },
      },
      { type: 'separator' },
      {
        label: `v${pkg.version} · changelog`,
        click: () => this.navigate('/changelog'),
      },
    );
    return { label: 'Account', submenu: items };
  }

  navigateMenu() {
    const nav = this.nav;
    const manifest = this.manifest;
    const items = [];

    if (manifest?.hasCharacter) {
      const chars = manifest.adminCharacters;
      if (chars && chars.length > 1) {
        const profileSub = [];
        const active = chars.find((c) => c.isActive);
        if (active) {
          profileSub.push({
            label: active.name,
            click: () => this.navigate('/profile'),
          });
        }
        for (const ch of chars) {
          if (!ch.isActive) {
            profileSub.push({
              label: ch.name,
              click: async () => {
                await siteApi.postJsonAuthed(
                  activeGameUrl.get(),
                  '/api/auth/active-character',
                  { characterId: ch.id },
                );
                if (this.canNavigate()) {
                  safeLoadURL(this.mainWindow.webContents, activeGameUrl.get());
                }
              },
            });
          }
        }
        items.push({ label: 'Profile', submenu: profileSub });
      } else {
        items.push({
          label: 'Profile',
          click: () => this.navigate('/profile'),
        });
      }

      items.push({
        label: 'Actions',
        click: () => this.navigate('/actions'),
      });

      const hs = manifest.homeState;
      if (hs) {
        const base = urls.regionUrlFromStateId(hs.id);
        const legLabel = getStateLegislatureLabel(hs.id);
        const stateSub = [
          { label: 'State Overview', click: () => this.navigate(base) },
        ];
        if (manifest.currentParty) {
          const adj = getStatePartyLinkAdjective(hs);
          stateSub.push({
            label: `${adj} ${manifest.currentParty.name}`,
            click: () =>
              this.navigate(
                urls.regionPartyUrlFromStateId(hs.id, manifest.currentParty.id),
              ),
          });
        }
        stateSub.push(
          {
            label: 'State Economy',
            click: () => this.navigate(`${base}?tab=economy`),
          },
          {
            label: legLabel,
            click: () =>
              this.navigate(urls.regionLegislatureUrlFromStateId(hs.id)),
          },
        );
        const ae = manifest.activeElection;
        if (ae) {
          const seatOrId = ae.seatId ?? ae.id;
          stateSub.push({
            label: 'My Election',
            click: () => this.navigate(`/elections/${seatOrId}`),
          });
        } else {
          stateSub.push({ label: 'My Election (None)', enabled: false });
        }
        items.push({ label: hs.name, submenu: stateSub });
      }

      const cid =
        manifest.characterCountryId ?? manifest.character_countryId ?? 'US';
      const campaignPath =
        manifest.campaignId != null
          ? `/campaign/${manifest.campaignId}`
          : '/campaign';

      const nationSub = [
        {
          label: nav.executive.label,
          click: () => this.navigate(nav.executive.route),
        },
        {
          label: nav.legislature.label,
          click: () => this.navigate(nav.legislature.route),
        },
        {
          label: 'National Budget',
          click: () => this.navigate(nav.budget.route),
        },
        {
          label: nav.campaign.label,
          click: () => this.navigate(campaignPath),
        },
      ];
      const presSeatId = manifest.activePresidentElectionSeatId;
      const presId = manifest.activePresidentElectionId;
      if (nav.presidentElection && (presSeatId || presId)) {
        nationSub.push({
          label: 'Presidential Election',
          click: () => this.navigate(`/elections/${presSeatId || presId}`),
        });
      }
      nationSub.push(
        { label: nav.map.label, click: () => this.navigate(nav.map.route) },
        {
          label: 'Political Parties',
          click: () => this.navigate(nav.parties.route),
        },
        {
          label: 'Elections',
          click: () => this.navigate(nav.elections.route),
        },
      );
      if (manifest.currentParty) {
        nationSub.push({
          label: `My Party · ${manifest.currentParty.name}`,
          click: () =>
            this.navigate(urls.partyUrl(cid, manifest.currentParty.id)),
        });
      }
      nationSub.push(
        {
          label: nav.centralBank.label,
          click: () => this.navigate(nav.centralBank.route),
        },
        {
          label: 'National Metrics',
          click: () => this.navigate(nav.metrics.route),
        },
        { label: 'Policy', click: () => this.navigate(nav.policy.route) },
        {
          label: 'Politicians',
          click: () => this.navigate(nav.politicians.route),
        },
      );
      items.push({ label: 'The Nation', submenu: nationSub });

      const worldSub = [
        { label: 'Nations', click: () => this.navigate('/world') },
        {
          label: 'Stock Market',
          click: () => this.navigate('/stockmarket/global'),
        },
      ];
      if (manifest.myCorporationId != null) {
        const corpSeg = encodeURIComponent(String(manifest.myCorporationId));
        const wageEnabled = manifest.isCeo === true;
        const wagePresetItems = WAGE_PRESETS.map((level) => ({
          label: WAGE_PRESET_LABELS[level] || `${formatWageLevel(level)}`,
          enabled: wageEnabled,
          click: () => this.handleBulkWage(level),
        }));
        const wagesSubmenu = [
          ...wagePresetItems,
          { type: 'separator' },
          {
            label: 'Custom level…',
            enabled: wageEnabled,
            click: () => this.promptCustomWage(),
          },
        ];
        worldSub.push({
          label: 'My Corporation',
          submenu: [
            {
              label: 'Open',
              click: () => this.navigate(`/corporation/${corpSeg}`),
            },
            {
              label: 'CEO Office',
              enabled: wageEnabled,
              click: () => this.navigate(`/corporation/${corpSeg}/ceo`),
            },
            { type: 'separator' },
            {
              label: 'Wages — Set all sectors',
              enabled: wageEnabled,
              submenu: wagesSubmenu,
            },
          ],
        });
      }
      worldSub.push({
        label: 'News',
        click: () =>
          this.navigate(`/news?country=${String(cid).toLowerCase()}`),
      });
      items.push({ label: 'World', submenu: worldSub });
    }

    items.push({ type: 'separator' });
    items.push({
      label: 'Pop Out Window',
      submenu: this.windowManager
        ? this.windowManager.getPresets().map((preset) => ({
            label: this.windowManager
              .getPresetConfig(preset)
              .title.split(' — ')[0],
            click: () => this.windowManager.openWindow(preset, this.mainWindow),
          }))
        : [],
    });

    return { label: 'Navigate', submenu: items };
  }

  /**
   * Update nav config and manifest, then rebuild the menu.
   * @param {object} nav - From getNavForCountry()
   * @param {object|null} manifest - From fetchClientNav()
   */
  setNavConfig(nav, manifest) {
    this.nav = nav;
    this.manifest = manifest;
    this.build();
  }

  adminMenu() {
    return {
      label: 'Admin',
      submenu: [
        {
          label: 'Election Controls',
          click: () => this.navigate('/admin/elections'),
        },
        {
          label: 'User Management',
          click: () => this.navigate('/admin/users'),
        },
        {
          label: 'Turn Processor',
          click: () => this.navigate('/admin/turns'),
        },
        { type: 'separator' },
        {
          label: 'Admin Dashboard',
          click: () => this.navigate('/admin'),
        },
      ],
    };
  }

  viewMenu() {
    return {
      label: 'View',
      submenu: [
        {
          label: 'Theme',
          submenu: THEMES.map((theme) => ({
            label: theme.label,
            click: () => {
              if (this.onThemeChange) {
                this.onThemeChange(theme.id);
              }
              if (!this.canNavigate()) return;
              this.mainWindow.webContents
                .executeJavaScript(
                  `document.documentElement.setAttribute('data-theme', '${theme.id}');
                 document.dispatchEvent(new CustomEvent('ahd-theme-change', { detail: '${theme.id}' }))`,
                )
                .catch(() => {});
            },
          })),
        },
        { type: 'separator' },
        {
          label: 'Focused Mode',
          type: 'checkbox',
          checked: this.isFocusedMode,
          click: (menuItem) => {
            if (this.onToggleFocusedMode) {
              this.onToggleFocusedMode(menuItem.checked);
            }
          },
        },
        {
          label: 'Turn Alert (60s warning)',
          type: 'checkbox',
          checked: this.cacheManager
            ? this.cacheManager.getPreference('turnAlertEnabled') !== false
            : true,
          click: (menuItem) => {
            if (this.cacheManager)
              this.cacheManager.setPreference(
                'turnAlertEnabled',
                menuItem.checked,
              );
          },
        },
        ...(this.gameServer?.envOverride
          ? [
              {
                label: 'Game server: custom (AHD_GAME_URL)',
                enabled: false,
              },
            ]
          : [
              (() => {
                const gs = this.gameServer;
                const useDev = gs?.useDevServer === true;
                const useSb = gs?.useSandbox === true;
                const standard = !useDev && !useSb;
                /** @type {Electron.MenuItemConstructorOptions[]} */
                const radios = [
                  {
                    type: 'radio',
                    label: 'Standard game server (default)',
                    checked: standard,
                    click: (menuItem) => {
                      if (menuItem.checked && gs?.onUseStandardServer) {
                        gs.onUseStandardServer();
                      }
                    },
                  },
                  {
                    type: 'radio',
                    label: 'Sandbox / test server (Supporter+)',
                    checked: useSb,
                    click: (menuItem) => {
                      if (menuItem.checked && gs?.onSwitch) {
                        gs.onSwitch(true);
                      }
                    },
                  },
                ];
                if (gs?.showDevToggle) {
                  radios.push({
                    type: 'radio',
                    label:
                      'Local dev server (localhost:3000) — dev build or admin',
                    checked: useDev,
                    click: (menuItem) => {
                      if (menuItem.checked && gs?.onSwitchDev) {
                        gs.onSwitchDev(true);
                      }
                    },
                  });
                }
                return {
                  label: 'Game server',
                  submenu: radios,
                };
              })(),
            ]),
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        {
          label: 'Copy Page URL',
          click: () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              clipboard.writeText(this.mainWindow.webContents.getURL());
            }
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Mini Mode (PiP)',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            if (this.onTogglePip) this.onTogglePip();
          },
        },
        ...(process.platform !== 'linux'
          ? [
              { type: 'separator' },
              {
                label: 'Open at Login',
                type: 'checkbox',
                checked: app.getLoginItemSettings().openAtLogin,
                click: (menuItem) => {
                  app.setLoginItemSettings({ openAtLogin: menuItem.checked });
                },
              },
            ]
          : []),
      ],
    };
  }

  helpMenu() {
    return {
      label: 'Help',
      submenu: [
        { label: 'Wiki', click: () => this.navigate('/wiki') },
        {
          label: 'Report bug / Suggest',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => {
            if (this.onOpenFeedback) {
              this.onOpenFeedback();
            } else {
              this.navigate('/feedback');
            }
          },
        },
        {
          label: 'Discord',
          click: () => shell.openExternal('https://discord.gg/DmF8zJJuqN'),
        },
      ],
    };
  }

  devMenu() {
    return {
      label: 'Developer',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'SSE Event Log',
          click: () => {
            if (this.onOpenEventLog) this.onOpenEventLog();
          },
        },
      ],
    };
  }

  /**
   * Whether the main window can still be navigated. Menu items can be
   * clicked after the window is closed/destroyed (e.g. on macOS while the
   * app stays alive with no windows) — touching a destroyed webContents
   * throws and shows the crash dialog.
   * @returns {boolean}
   */
  canNavigate() {
    return !!(this.mainWindow && !this.mainWindow.isDestroyed());
  }

  /** Reload the game page in the main window (no-op when it is gone). */
  reloadMainWindow() {
    if (!this.canNavigate()) return;
    // Re-load the current page in place. Loading the bare game URL here used
    // to throw the user back to the home route from anywhere in the app.
    const currentURL = this.mainWindow.webContents.getURL();
    if (currentURL && currentURL.startsWith('http')) {
      this.mainWindow.webContents.reload();
      return;
    }
    safeLoadURL(this.mainWindow.webContents, activeGameUrl.get());
  }

  /**
   * Navigate the main window to a game route.
   * @param {string} route - Path relative to GAME_URL
   */
  navigate(route) {
    if (!this.canNavigate()) return;
    safeLoadURL(this.mainWindow.webContents, `${activeGameUrl.get()}${route}`);
  }

  /**
   * Toggle the Admin menu visibility and rebuild.
   * @param {boolean} isAdmin
   */
  setAdmin(isAdmin) {
    this.isAdmin = isAdmin;
    this.build();
  }

  /**
   * Update the Focused Mode checkbox state and rebuild the menu.
   * @param {boolean} enabled
   */
  setFocusedMode(enabled) {
    this.isFocusedMode = enabled;
    this.build();
  }

  setWindow(win) {
    this.mainWindow = win;
  }

  /**
   * Prompt for a custom wage level (0.8–1.5) via a simple input dialog injected into the page.
   * Falls back to 1.0 if the user cancels or enters an invalid value.
   */
  async promptCustomWage() {
    const validation = validateCanAdjustWages(this.manifest);
    if (!validation.ok) {
      dialog.showMessageBox(this.mainWindow, {
        type: 'warning',
        title: 'Wages — Cannot adjust',
        message: validation.reason,
        buttons: ['OK'],
      });
      return;
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    try {
      const raw = await this.mainWindow.webContents.executeJavaScript(
        `(() => { const v = window.prompt('Enter wage level for ALL sectors (0.8 – 1.5):\\n0.8 = minimum, 1.0 = baseline, 1.5 = maximum', '1.0'); return v == null ? null : String(v).trim(); })()`,
      );
      if (raw == null || raw === '') return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        dialog.showMessageBox(this.mainWindow, {
          type: 'error',
          title: 'Wages — Invalid input',
          message: `"${raw}" is not a number. Enter a value between 0.8 and 1.5.`,
          buttons: ['OK'],
        });
        return;
      }
      await this.handleBulkWage(parsed);
    } catch {
      // prompt dismissed or webContents gone — ignore
    }
  }

  /**
   * Bulk-set all corporation sectors to wageLevel (clamped to [0.8, 1.5]).
   * Shows confirmation, fans out per-sector POSTs, and reports the result.
   * @param {number} wageLevel
   */
  async handleBulkWage(wageLevel) {
    const clamped = clampWageLevel(wageLevel);
    const validation = validateCanAdjustWages(this.manifest);
    if (!validation.ok) {
      dialog.showMessageBox(this.mainWindow, {
        type: 'warning',
        title: 'Wages — Cannot adjust',
        message: validation.reason,
        buttons: ['OK'],
      });
      return;
    }
    const corporationId = validation.corporationId;
    const gameUrl = activeGameUrl.get();

    // Enumerate sectors up front so the confirmation can state the real count
    // and, for large corps, how long the paced apply will take.
    let sectors;
    try {
      sectors = await siteApi.fetchCorporationSectorIds(gameUrl, corporationId);
    } catch (err) {
      dialog.showMessageBox(this.mainWindow, {
        type: 'error',
        title: 'Wages — Failed',
        message: 'Could not fetch corporation sectors.',
        detail: err?.message || String(err),
        buttons: ['OK'],
      });
      return;
    }

    if (!sectors || sectors.length === 0) {
      dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Wages — Nothing to do',
        message: 'No sectors found for this corporation.',
        buttons: ['OK'],
      });
      return;
    }

    const estimateMs = estimateBulkWageDurationMs(sectors.length);
    const paceNote =
      estimateMs > 0
        ? `\n\nThe server accepts ${BULK_WAGE_MAX_PER_WINDOW} wage changes per minute, so applying ` +
          `${sectors.length} sectors is paced and will take ${formatDuration(estimateMs)}. ` +
          `Leave the app open — progress shows on the taskbar icon.`
        : '';

    const { response } = await dialog.showMessageBox(this.mainWindow, {
      type: 'question',
      title: 'Confirm wage change',
      message: `Set all ${sectors.length} sector(s) to ${formatWageLevel(clamped)}?`,
      detail:
        `This will update every sector you own (0.80x = minimum cost, 1.00x = baseline, 1.50x = maximum).\n` +
        `Lower wages boost profit but raise unionization/strike risk; higher wages improve morale/quality.\n\n` +
        `Corporation: ${corporationId}\n` +
        `Range is clamped to [0.8, 1.5] — e.g. 0.7 becomes 0.80x, 2.0 becomes 1.50x.` +
        paceNote,
      buttons: ['Cancel', `Set to ${formatWageLevel(clamped)}`],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) return;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setProgressBar(0);
    }

    let result;
    try {
      result = await bulkSetWageLevel({
        gameUrl,
        corporationId,
        wageLevel: clamped,
        setOne: (corpId, sectorId, lvl) =>
          siteApi.postSectorWage(gameUrl, corpId, sectorId, lvl),
        // Already enumerated above — don't re-fetch.
        listSectors: () => Promise.resolve(sectors),
        onProgress: ({ done, total }) => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setProgressBar(total > 0 ? done / total : -1);
          }
        },
      });
    } catch (err) {
      if (this.mainWindow && !this.mainWindow.isDestroyed())
        this.mainWindow.setProgressBar(-1);
      dialog.showMessageBox(this.mainWindow, {
        type: 'error',
        title: 'Wages — Failed',
        message: 'Could not apply the wage change.',
        detail: err?.message || String(err),
        buttons: ['OK'],
      });
      return;
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed())
      this.mainWindow.setProgressBar(-1);

    const pacedNote =
      result.rateLimitWaits > 0
        ? `\n\nPaused ${result.rateLimitWaits} time(s) to respect the server's ` +
          `${BULK_WAGE_MAX_PER_WINDOW}-per-minute wage limit.`
        : '';

    if (result.failed === 0) {
      dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Wages — Done',
        message: `All ${result.succeeded} sector(s) set to ${formatWageLevel(result.clamped)}.`,
        detail: pacedNote.trim() || undefined,
        buttons: ['OK'],
      });
    } else {
      const detail =
        `${result.succeeded} succeeded, ${result.failed} failed of ${result.total}.\n` +
        result.errors
          .slice(0, 5)
          .map((e) => `• ${e.sectorId}: ${e.error}`)
          .join('\n') +
        (result.errors.length > 5
          ? `\n… and ${result.errors.length - 5} more`
          : '') +
        pacedNote +
        '\n\nYou can retry from the same menu — successful sectors are already at the new level.';
      dialog.showMessageBox(this.mainWindow, {
        type: 'warning',
        title: 'Wages — Partially applied',
        message: `Wages set to ${formatWageLevel(result.clamped)} — ${result.failed} sector(s) failed.`,
        detail,
        buttons: ['OK'],
      });
    }
  }
}

module.exports = MenuManager;
