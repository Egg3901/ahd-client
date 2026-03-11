const { Menu, session } = require('electron');
const config = require('./config');

/**
 * Custom application menu replacing the default Electron menu.
 * Game-aware menus: Game, Navigate, Admin (conditional), View (with themes), Help.
 * The Admin menu only appears when setAdmin(true) is called from the renderer.
 */

/** @type {{id: string, label: string}[]} The site's available themes */
const THEMES = [
  { id: 'default', label: 'Default' },
  { id: 'light', label: 'Light' },
  { id: 'oled', label: 'OLED' },
  { id: 'usa', label: 'USA' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'dark-pastel', label: 'Dark Pastel' },
];

class MenuManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow
   * @param {import('./windows')} windowManager - For pop-out window presets
   * @param {{onThemeChange?: (id: string) => void, onTogglePip?: () => void, onOpenFeedback?: () => void, onToggleFocusedMode?: (enabled: boolean) => void, isAdmin?: boolean, isFocusedMode?: boolean}} [options]
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
  }

  /**
   * Build and set the application menu from all submenus.
   * Call again after setAdmin() to refresh.
   */
  build() {
    const template = [
      this.gameMenu(),
      this.navigateMenu(),
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
    return {
      label: 'Game',
      submenu: [
        {
          label: 'My Politician',
          accelerator: 'CmdOrCtrl+P',
          click: () => this.navigate('/politician'),
        },
        {
          label: 'Campaign HQ',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => this.navigate('/campaign'),
        },
        {
          label: 'Notifications',
          accelerator: 'CmdOrCtrl+N',
          click: () => this.navigate('/notifications'),
        },
        {
          label: 'Achievements',
          click: () => this.navigate('/achievements'),
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => this.mainWindow.loadURL(config.GAME_URL),
        },
        {
          label: 'Go Home',
          accelerator: 'CmdOrCtrl+H',
          click: () => this.mainWindow.loadURL(config.GAME_URL),
        },
        { type: 'separator' },
        {
          label: 'Clear Cache & Reload',
          click: async () => {
            // Clear the persist:ahd partition cache, not defaultSession
            const ses = session.fromPartition('persist:ahd');
            await ses.clearCache();
            this.mainWindow.loadURL(config.GAME_URL);
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    };
  }

  navigateMenu() {
    return {
      label: 'Navigate',
      submenu: [
        {
          label: 'Elections',
          click: () => this.navigate('/elections'),
        },
        {
          label: 'Congress',
          click: () => this.navigate('/legislature'),
        },
        {
          label: 'Legislature',
          click: () => this.navigate('/bills'),
        },
        {
          label: 'State',
          click: () => this.navigate('/state'),
        },
        {
          label: 'Country',
          click: () => this.navigate('/country'),
        },
        { type: 'separator' },
        {
          label: 'Pop Out Window',
          submenu: this.windowManager
            ? this.windowManager.getPresets().map((preset) => ({
                label: this.windowManager
                  .getPresetConfig(preset)
                  .title.split(' — ')[0],
                click: () =>
                  this.windowManager.openWindow(preset, this.mainWindow),
              }))
            : [],
        },
      ],
    };
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
              // Set data-theme attribute and dispatch event for the site's ThemeContext
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
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
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
      ],
    };
  }

  helpMenu() {
    return {
      label: 'Help',
      submenu: [
        {
          label: 'Game Wiki',
          click: () => this.navigate('/wiki'),
        },
        {
          label: 'Roadmap',
          click: () => this.navigate('/roadmap'),
        },
        {
          label: 'Changelog',
          click: () => this.navigate('/changelog'),
        },
        { type: 'separator' },
        {
          label: 'Submit Feedback',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => {
            if (this.onOpenFeedback) {
              this.onOpenFeedback();
            } else {
              this.navigate('/feedback');
            }
          },
        },
        { type: 'separator' },
        {
          label: `Version ${require('../package.json').version}`,
          enabled: false,
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
      this.mainWindow.loadURL(`${config.GAME_URL}${route}`);
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
