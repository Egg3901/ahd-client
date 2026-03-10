const { Menu, session } = require('electron');
const config = require('./config');

/**
 * Custom application menu replacing the default Electron menu.
 * Game-aware menus: Game, Navigate, Admin, View, Help.
 */

const THEMES = [
  { id: 'default', label: 'Default' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'patriot', label: 'Patriot' },
  { id: 'gilded', label: 'Gilded Age' },
  { id: 'liberty', label: 'Liberty' },
  { id: 'federal', label: 'Federal' },
];

class MenuManager {
  constructor(mainWindow, windowManager, options = {}) {
    this.mainWindow = mainWindow;
    this.windowManager = windowManager;
    this.isAdmin = options.isAdmin || false;
    this.onThemeChange = options.onThemeChange || null;
    this.onTogglePip = options.onTogglePip || null;
    this.onOpenFeedback = options.onOpenFeedback || null;
  }

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
            await session.defaultSession.clearCache();
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
              // Inject theme change into the renderer
              this.mainWindow.webContents.executeJavaScript(
                `document.dispatchEvent(new CustomEvent('ahd-theme-change', { detail: '${theme.id}' }))`,
              );
            },
          })),
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

  navigate(route) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.loadURL(`${config.GAME_URL}${route}`);
    }
  }

  setAdmin(isAdmin) {
    this.isAdmin = isAdmin;
    this.build();
  }

  setWindow(win) {
    this.mainWindow = win;
  }
}

module.exports = MenuManager;
