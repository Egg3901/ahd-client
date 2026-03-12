const EventEmitter = require('events');

// --- BrowserWindow ---
function createMockWebContents() {
  const emitter = new EventEmitter();
  const webContents = {
    send: jest.fn(),
    executeJavaScript: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event, handler) => {
      emitter.on(event, handler);
      return webContents;
    }),
    once: jest.fn((event, handler) => {
      emitter.once(event, handler);
      return webContents;
    }),
    capturePage: jest.fn().mockResolvedValue({
      toPNG: jest.fn().mockReturnValue(Buffer.from('fake-png')),
    }),
    setWindowOpenHandler: jest.fn(),
    _emit: (event, ...args) => emitter.emit(event, ...args),
  };
  return webContents;
}

class BrowserWindow {
  constructor(options = {}) {
    this._options = options;
    this._destroyed = false;
    this._visible = true;
    this._focused = true;
    this._title = options.title || '';
    this.webContents = createMockWebContents();
    BrowserWindow._instances.push(this);
  }
}

BrowserWindow.prototype.loadURL = jest.fn().mockResolvedValue(undefined);
BrowserWindow.prototype.loadFile = jest.fn().mockResolvedValue(undefined);
BrowserWindow.prototype.show = jest.fn(function () {
  this._visible = true;
});
BrowserWindow.prototype.hide = jest.fn(function () {
  this._visible = false;
});
BrowserWindow.prototype.focus = jest.fn(function () {
  this._focused = true;
});
BrowserWindow.prototype.close = jest.fn(function () {
  this._destroyed = true;
  if (this._onClosed) this._onClosed();
});
BrowserWindow.prototype.destroy = jest.fn(function () {
  this._destroyed = true;
});
BrowserWindow.prototype.isDestroyed = jest.fn(function () {
  return this._destroyed;
});
BrowserWindow.prototype.isVisible = jest.fn(function () {
  return this._visible;
});
BrowserWindow.prototype.isFocused = jest.fn(function () {
  return this._focused;
});
BrowserWindow.prototype.setTitle = jest.fn(function (t) {
  this._title = t;
});
BrowserWindow.prototype.setProgressBar = jest.fn();
BrowserWindow.prototype.setBounds = jest.fn();
BrowserWindow.prototype.setMenuBarVisibility = jest.fn();
BrowserWindow.prototype.on = jest.fn(function (event, handler) {
  if (event === 'closed') this._onClosed = handler;
  if (event === 'focus') this._onFocus = handler;
  return this;
});
BrowserWindow.prototype.once = jest.fn(function (event, handler) {
  if (event === 'ready-to-show') this._onReadyToShow = handler;
  return this;
});

BrowserWindow._instances = [];
BrowserWindow._reset = () => {
  BrowserWindow._instances = [];
};

// --- Tray ---
class Tray {
  constructor() {
    this._destroyed = false;
  }
}
Tray.prototype.setContextMenu = jest.fn();
Tray.prototype.setToolTip = jest.fn();
Tray.prototype.setImage = jest.fn();
Tray.prototype.destroy = jest.fn(function () {
  this._destroyed = true;
});
Tray.prototype.on = jest.fn();

// --- Menu ---
const Menu = {
  buildFromTemplate: jest.fn((template) => ({ items: template })),
  setApplicationMenu: jest.fn(),
  getApplicationMenu: jest.fn().mockReturnValue(null),
};

// --- app ---
const app = {
  whenReady: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn(),
  getVersion: jest.fn().mockReturnValue(require('../../package.json').version),
  getPath: jest.fn((name) => `/tmp/ahd-${name}`),
  setBadgeCount: jest.fn(),
  on: jest.fn(),
  isPackaged: false,
};

// --- globalShortcut ---
const globalShortcut = {
  register: jest.fn().mockReturnValue(true),
  unregister: jest.fn(),
  unregisterAll: jest.fn(),
};

// --- nativeTheme ---
const nativeTheme = {
  themeSource: 'system',
};

// --- dialog ---
const dialog = {
  showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
  showSaveDialog: jest
    .fn()
    .mockResolvedValue({ canceled: false, filePath: '/tmp/test.png' }),
  showErrorBox: jest.fn(),
};

// --- shell ---
const shell = {
  openExternal: jest.fn().mockResolvedValue(undefined),
};

// --- session ---
const session = {
  fromPartition: jest.fn(() => ({
    cookies: {
      get: jest.fn().mockResolvedValue([]),
    },
    clearCache: jest.fn().mockResolvedValue(undefined),
  })),
};

// --- ipcMain ---
const ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  removeHandler: jest.fn(),
};

// --- ipcRenderer ---
const ipcRenderer = {
  invoke: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
};

// --- contextBridge ---
const contextBridge = {
  exposeInMainWorld: jest.fn(),
};

// --- Notification ---
class Notification {
  constructor(options = {}) {
    this._options = options;
  }
}
Notification.prototype.show = jest.fn();
Notification.prototype.on = jest.fn();
Notification.isSupported = jest.fn().mockReturnValue(true);

// --- nativeImage ---
const nativeImage = {
  createFromPath: jest.fn(() => ({
    resize: jest.fn(() => ({})),
    toPNG: jest.fn().mockReturnValue(Buffer.from('fake-png')),
  })),
  createEmpty: jest.fn(() => ({})),
};

// --- net ---
function createMockRequest() {
  const emitter = new EventEmitter();
  const req = {
    setHeader: jest.fn(),
    on: jest.fn((event, handler) => {
      emitter.on(event, handler);
      return req;
    }),
    end: jest.fn(),
    abort: jest.fn(),
    write: jest.fn(),
    _emit: (event, ...args) => emitter.emit(event, ...args),
  };
  return req;
}

const net = {
  request: jest.fn(() => createMockRequest()),
};

module.exports = {
  BrowserWindow,
  Tray,
  Menu,
  app,
  globalShortcut,
  nativeTheme,
  dialog,
  shell,
  session,
  ipcMain,
  ipcRenderer,
  contextBridge,
  Notification,
  nativeImage,
  net,
};
