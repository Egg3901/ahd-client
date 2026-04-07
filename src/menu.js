const { Menu, session, shell, clipboard, app } = require('electron');
const activeGameUrl = require('./active-game-url');
const siteApi = require('./site-api');
const urls = require('./urls');
const {
  getStateLegislatureLabel,
  getStatePartyLinkAdjective,
} = require('./uk-state-labels');
const { getNavForCountry } = require('./nav');
const { buildGamePanelMenuTemplate } = require('./game-panel-links');

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
        click: () => this.mainWindow.loadURL(activeGameUrl.get()),
      },
      {
        label: 'Go Home',
        accelerator: 'CmdOrCtrl+H',
        click: () => this.mainWindow.loadURL(activeGameUrl.get()),
      },
      { type: 'separator' },
      {
        label: 'Clear Cache & Reload',
        click: async () => {
          const ses = session.fromPartition('persist:ahd');
          await ses.clearCache();
          this.mainWindow.loadURL(activeGameUrl.get());
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
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.loadURL(`${activeGameUrl.get()}/`);
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
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                  this.mainWindow.loadURL(activeGameUrl.get());
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
        worldSub.push({
          label: 'My Corporation',
          click: () =>
            this.navigate(`/corporation/${manifest.myCorporationId}`),
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
              this.mainWindow.webContents.executeJavaScript(
                `document.documentElement.setAttribute('data-theme', '${theme.id}');
                 document.dispatchEvent(new CustomEvent('ahd-theme-change', { detail: '${theme.id}' }))`,
              );
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
              this.cacheManager.setPreference('turnAlertEnabled', menuItem.checked);
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
   * Navigate the main window to a game route.
   * @param {string} route - Path relative to GAME_URL
   */
  navigate(route) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.loadURL(`${activeGameUrl.get()}${route}`);
    }
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
}

module.exports = MenuManager;
