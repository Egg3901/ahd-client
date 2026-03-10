const { app, BrowserWindow, shell, Menu, session } = require('electron');
const path = require('path');
const config = require('./config');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: config.WINDOW_WIDTH,
    height: config.WINDOW_HEIGHT,
    minWidth: config.MIN_WIDTH,
    minHeight: config.MIN_HEIGHT,
    title: 'A House Divided',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  // Show the loading screen while the game loads
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // After the loading screen renders, navigate to the game server
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.loadURL(config.GAME_URL);
  });

  // When the game page finishes loading, update the title
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    mainWindow.setTitle(`A House Divided — ${title}`);
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(config.GAME_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Handle navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(config.GAME_URL) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: 'Game',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow.loadURL(config.GAME_URL),
        },
        {
          label: 'Go Home',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow.loadURL(config.GAME_URL),
        },
        { type: 'separator' },
        {
          label: 'Clear Cache & Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: async () => {
            await session.defaultSession.clearCache();
            mainWindow.loadURL(config.GAME_URL);
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  // Add dev tools in development mode
  if (process.env.NODE_ENV === 'development') {
    template.push({
      label: 'Developer',
      submenu: [
        { role: 'toggleDevTools' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
