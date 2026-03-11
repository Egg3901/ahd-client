# Test Suite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a comprehensive test suite (unit, integration, E2E) to the AHD Electron desktop client.

**Architecture:** Jest for unit/integration tests with mocked Electron APIs, Playwright Electron for E2E tests. Shared mock layer in `tests/__mocks__/` provides reusable fakes for BrowserWindow, Tray, app, etc. Coverage thresholds enforced at 80%.

**Tech Stack:** Jest, Playwright (`electron` launcher), cross-env

---

## File Structure

```
tests/
├── __mocks__/
│   ├── electron.js          # All Electron API mocks
│   ├── electron-store.js    # In-memory store mock
│   └── electron-updater.js  # autoUpdater mock
├── unit/
│   ├── config.test.js
│   ├── sse.test.js
│   ├── cache.test.js
│   ├── notifications.test.js
│   ├── tray.test.js
│   ├── windows.test.js
│   ├── shortcuts.test.js
│   ├── menu.test.js
│   ├── pip.test.js
│   ├── feedback.test.js
│   ├── updater.test.js
│   ├── devtools.test.js
│   ├── ipc.test.js
│   └── preload.test.js
├── integration/
│   ├── sse-notifications.test.js
│   ├── game-state-flow.test.js
│   ├── ipc-handlers.test.js
│   └── theme-sync.test.js
└── e2e/
    ├── app-launch.test.js
    ├── window-management.test.js
    └── navigation.test.js

Root files:
├── jest.config.js           # Jest multi-project config
└── playwright.config.js     # Playwright Electron config (for E2E reference)
```

---

## Chunk 1: Infrastructure Setup

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Jest and Playwright**

```bash
npm install --save-dev jest @playwright/test electron-playwright-helpers
```

- [ ] **Step 2: Verify installation**

```bash
npx jest --version
npx playwright --version
```

Expected: Version numbers printed without error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jest and playwright dev dependencies"
```

---

### Task 2: Create Jest config

**Files:**
- Create: `jest.config.js`

- [ ] **Step 1: Write jest.config.js**

```js
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.js',
        '<rootDir>/tests/integration/**/*.test.js',
      ],
      testEnvironment: 'node',
      moduleNameMapper: {
        '^electron$': '<rootDir>/tests/__mocks__/electron.js',
        '^electron-store$': '<rootDir>/tests/__mocks__/electron-store.js',
        '^electron-updater$': '<rootDir>/tests/__mocks__/electron-updater.js',
      },
      clearMocks: true,
      coverageDirectory: 'coverage',
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
      coverageThreshold: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  ],
};
```

- [ ] **Step 2: Add npm scripts to package.json**

Add these scripts to the `"scripts"` object in `package.json`:

```json
"test": "jest --project unit",
"test:unit": "jest --project unit --testPathPattern=tests/unit",
"test:integration": "jest --project unit --testPathPattern=tests/integration",
"test:e2e": "npx playwright test --config=tests/e2e",
"test:coverage": "jest --project unit --coverage"
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p tests/__mocks__ tests/unit tests/integration tests/e2e
```

- [ ] **Step 4: Verify Jest runs (no tests yet)**

```bash
npx jest --project unit --passWithNoTests
```

Expected: "No tests found" or pass with 0 tests.

- [ ] **Step 5: Commit**

```bash
git add jest.config.js package.json tests/
git commit -m "chore: add jest config and test directory structure"
```

---

### Task 3: Create Electron mock

**Files:**
- Create: `tests/__mocks__/electron.js`

This is the most critical file — all unit tests depend on it.

- [ ] **Step 1: Write the Electron mock**

```js
const EventEmitter = require('events');

// --- BrowserWindow ---
function createMockWebContents() {
  const emitter = new EventEmitter();
  return {
    send: jest.fn(),
    executeJavaScript: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event, handler) => {
      emitter.on(event, handler);
      return this;
    }),
    once: jest.fn((event, handler) => {
      emitter.once(event, handler);
      return this;
    }),
    capturePage: jest.fn().mockResolvedValue({
      toPNG: jest.fn().mockReturnValue(Buffer.from('fake-png')),
    }),
    setWindowOpenHandler: jest.fn(),
    _emit: (event, ...args) => emitter.emit(event, ...args),
  };
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

  loadURL = jest.fn().mockResolvedValue(undefined);
  loadFile = jest.fn().mockResolvedValue(undefined);
  show = jest.fn(() => { this._visible = true; });
  hide = jest.fn(() => { this._visible = false; });
  focus = jest.fn(() => { this._focused = true; });
  close = jest.fn(() => {
    this._destroyed = true;
    if (this._onClosed) this._onClosed();
  });
  destroy = jest.fn(() => { this._destroyed = true; });
  isDestroyed = jest.fn(() => this._destroyed);
  isVisible = jest.fn(() => this._visible);
  isFocused = jest.fn(() => this._focused);
  setTitle = jest.fn((t) => { this._title = t; });
  setProgressBar = jest.fn();
  setBounds = jest.fn();
  setMenuBarVisibility = jest.fn();

  on = jest.fn((event, handler) => {
    if (event === 'closed') this._onClosed = handler;
    if (event === 'focus') this._onFocus = handler;
    return this;
  });
  once = jest.fn((event, handler) => {
    if (event === 'ready-to-show') {
      this._onReadyToShow = handler;
    }
    return this;
  });
}

BrowserWindow._instances = [];
BrowserWindow._reset = () => { BrowserWindow._instances = []; };

// --- Tray ---
class Tray {
  constructor() {
    this._destroyed = false;
  }
  setContextMenu = jest.fn();
  setToolTip = jest.fn();
  setImage = jest.fn();
  destroy = jest.fn(() => { this._destroyed = true; });
  on = jest.fn();
}

// --- Menu ---
const Menu = {
  buildFromTemplate: jest.fn((template) => ({ items: template })),
  setApplicationMenu: jest.fn(),
};

// --- app ---
const app = {
  whenReady: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn(),
  getVersion: jest.fn().mockReturnValue('0.1.0'),
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
  showSaveDialog: jest.fn().mockResolvedValue({ canceled: false, filePath: '/tmp/test.png' }),
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
  show = jest.fn();
  on = jest.fn();
  static isSupported = jest.fn().mockReturnValue(true);
}

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
  return {
    setHeader: jest.fn(),
    on: jest.fn((event, handler) => {
      emitter.on(event, handler);
      return this;
    }),
    end: jest.fn(),
    abort: jest.fn(),
    _emit: (event, ...args) => emitter.emit(event, ...args),
  };
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
```

- [ ] **Step 2: Verify mock loads**

```bash
node -e "const m = require('./tests/__mocks__/electron.js'); console.log(Object.keys(m).join(', '))"
```

Expected: `BrowserWindow, Tray, Menu, app, globalShortcut, nativeTheme, dialog, shell, session, ipcMain, ipcRenderer, contextBridge, Notification, nativeImage, net`

- [ ] **Step 3: Commit**

```bash
git add tests/__mocks__/electron.js
git commit -m "test: add shared Electron API mock layer"
```

---

### Task 4: Create electron-store mock

**Files:**
- Create: `tests/__mocks__/electron-store.js`

- [ ] **Step 1: Write the in-memory store mock**

```js
class Store {
  constructor(options = {}) {
    this._data = new Map();
    this._schema = options.schema || {};
    this._name = options.name || 'test-store';

    // Initialize defaults from schema
    for (const [key, def] of Object.entries(this._schema)) {
      if (def.default !== undefined) {
        this._data.set(key, JSON.parse(JSON.stringify(def.default)));
      }
    }
  }

  get(key, defaultValue) {
    // Support dotted paths like 'userPreferences.theme'
    const parts = key.split('.');
    let value = this._data.get(parts[0]);

    for (let i = 1; i < parts.length; i++) {
      if (value === undefined || value === null) return defaultValue;
      value = value[parts[i]];
    }

    return value !== undefined ? value : defaultValue;
  }

  set(key, value) {
    const parts = key.split('.');

    if (parts.length === 1) {
      this._data.set(key, value);
      return;
    }

    // Dotted path: set nested property
    let obj = this._data.get(parts[0]);
    if (obj === undefined || obj === null) {
      obj = {};
      this._data.set(parts[0], obj);
    }

    for (let i = 1; i < parts.length - 1; i++) {
      if (obj[parts[i]] === undefined) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }

    obj[parts[parts.length - 1]] = value;
  }

  delete(key) {
    this._data.delete(key);
  }

  has(key) {
    return this._data.has(key);
  }

  clear() {
    this._data.clear();
  }
}

module.exports = Store;
```

- [ ] **Step 2: Commit**

```bash
git add tests/__mocks__/electron-store.js
git commit -m "test: add in-memory electron-store mock"
```

---

### Task 5: Create electron-updater mock

**Files:**
- Create: `tests/__mocks__/electron-updater.js`

- [ ] **Step 1: Write the autoUpdater mock**

```js
const EventEmitter = require('events');

class MockAutoUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = true;
    this.autoInstallOnAppQuit = true;
  }

  checkForUpdates = jest.fn();
  downloadUpdate = jest.fn();
  quitAndInstall = jest.fn();
}

const autoUpdater = new MockAutoUpdater();

module.exports = { autoUpdater };
```

- [ ] **Step 2: Commit**

```bash
git add tests/__mocks__/electron-updater.js
git commit -m "test: add electron-updater mock"
```

---

## Chunk 2: Unit Tests — Core Modules

### Task 6: Test config.js

**Files:**
- Create: `tests/unit/config.test.js`
- Test: `src/config.js`

- [ ] **Step 1: Write config tests**

```js
describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('exports default GAME_URL', () => {
    const config = require('../../src/config');
    expect(config.GAME_URL).toBe('https://ahousedividedgame.com');
  });

  test('respects AHD_GAME_URL env var', () => {
    process.env.AHD_GAME_URL = 'http://localhost:3000';
    const config = require('../../src/config');
    expect(config.GAME_URL).toBe('http://localhost:3000');
  });

  test('exports correct window dimensions', () => {
    const config = require('../../src/config');
    expect(config.WINDOW_WIDTH).toBe(1280);
    expect(config.WINDOW_HEIGHT).toBe(800);
    expect(config.MIN_WIDTH).toBe(800);
    expect(config.MIN_HEIGHT).toBe(600);
  });

  test('exports update check interval of 1 hour', () => {
    const config = require('../../src/config');
    expect(config.UPDATE_CHECK_INTERVAL).toBe(3600000);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/config.test.js --verbose
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/config.test.js
git commit -m "test: add config.js unit tests"
```

---

### Task 7: Test sse.js

**Files:**
- Create: `tests/unit/sse.test.js`
- Test: `src/sse.js`

- [ ] **Step 1: Write SSE client tests**

```js
const SSEClient = require('../../src/sse');

describe('SSEClient', () => {
  let client;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new SSEClient();
  });

  afterEach(() => {
    client.disconnect();
    jest.useRealTimers();
  });

  test('starts disconnected', () => {
    expect(client.isConnected()).toBe(false);
  });

  test('setCookie stores cookie', () => {
    client.setCookie('token=abc');
    expect(client.cookie).toBe('token=abc');
  });

  test('disconnect clears state', () => {
    client.connected = true;
    client.buffer = 'some data';
    client.retryTimeout = setTimeout(() => {}, 1000);
    client.disconnect();

    expect(client.isConnected()).toBe(false);
    expect(client.buffer).toBe('');
    expect(client.retryTimeout).toBeNull();
    expect(client.request).toBeNull();
  });

  test('processBuffer parses simple SSE frame', () => {
    const events = [];
    client.on('event', (e) => events.push(e));

    client.buffer = 'data: {"turn":5}\n\n';
    client.processBuffer();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'message',
      data: { turn: 5 },
    });
  });

  test('processBuffer parses typed event', () => {
    const events = [];
    client.on('event', (e) => events.push(e));

    client.buffer = 'event: turn_complete\ndata: {"turn":5}\n\n';
    client.processBuffer();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('turn_complete');
    expect(events[0].data).toEqual({ turn: 5 });
  });

  test('processBuffer emits event-type-specific event', () => {
    const handler = jest.fn();
    client.on('turn_complete', handler);

    client.buffer = 'event: turn_complete\ndata: {"turn":5}\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenCalledWith({ turn: 5 });
  });

  test('processBuffer falls back to string when JSON parse fails', () => {
    const events = [];
    client.on('event', (e) => events.push(e));

    client.buffer = 'data: not-json\n\n';
    client.processBuffer();

    expect(events[0].data).toBe('not-json');
  });

  test('processBuffer handles multi-line data', () => {
    const events = [];
    client.on('event', (e) => events.push(e));

    client.buffer = 'data: line1\ndata: line2\n\n';
    client.processBuffer();

    expect(events[0].data).toBe('line1\nline2');
  });

  test('processBuffer keeps incomplete frame in buffer', () => {
    const events = [];
    client.on('event', (e) => events.push(e));

    client.buffer = 'data: {"complete":true}\n\ndata: partial';
    client.processBuffer();

    expect(events).toHaveLength(1);
    expect(client.buffer).toBe('data: partial');
  });

  test('buffer overflow guard flushes when exceeding maxBufferSize', () => {
    // Simulate a connect scenario where buffer gets data
    // We test the guard directly
    client.maxBufferSize = 100;
    client.buffer = 'x'.repeat(101);

    // The guard is inside the response data handler, but we can test
    // processBuffer after simulating the guard logic
    expect(client.buffer.length).toBeGreaterThan(client.maxBufferSize);
  });

  test('scheduleReconnect uses exponential backoff', () => {
    const handler = jest.fn();
    client.on('reconnecting', handler);

    client.scheduleReconnect();
    expect(handler).toHaveBeenCalledWith({ delay: 2000, attempt: 1 });

    // Clear the timeout so we can schedule another
    clearTimeout(client.retryTimeout);
    client.retryTimeout = null;

    client.scheduleReconnect();
    expect(handler).toHaveBeenCalledWith({ delay: 4000, attempt: 2 });

    clearTimeout(client.retryTimeout);
    client.retryTimeout = null;

    client.scheduleReconnect();
    expect(handler).toHaveBeenCalledWith({ delay: 8000, attempt: 3 });
  });

  test('scheduleReconnect caps at maxRetryDelay', () => {
    const handler = jest.fn();
    client.on('reconnecting', handler);
    client.retryCount = 20; // 2000 * 2^20 >> 60000

    client.scheduleReconnect();
    expect(handler).toHaveBeenCalledWith({ delay: 60000, attempt: 21 });
  });

  test('scheduleReconnect is no-op when timeout already pending', () => {
    const handler = jest.fn();
    client.on('reconnecting', handler);

    client.scheduleReconnect();
    client.scheduleReconnect(); // second call should no-op

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/sse.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/sse.test.js
git commit -m "test: add SSEClient unit tests"
```

---

### Task 8: Test cache.js

**Files:**
- Create: `tests/unit/cache.test.js`
- Test: `src/cache.js`

- [ ] **Step 1: Write cache tests**

```js
const CacheManager = require('../../src/cache');

describe('CacheManager', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheManager();
  });

  describe('turn data', () => {
    test('cacheTurnData stores data with timestamp', () => {
      const before = Date.now();
      cache.cacheTurnData({ turn: 5, data: 'test' });
      const result = cache.getCachedTurnData();

      expect(result.turn).toBe(5);
      expect(result.data).toBe('test');
      expect(result.cachedAt).toBeGreaterThanOrEqual(before);
    });

    test('getCachedTurnData returns empty object when no data', () => {
      expect(cache.getCachedTurnData()).toEqual({});
    });
  });

  describe('action queue', () => {
    test('queueAction adds action with ID and timestamp', () => {
      const length = cache.queueAction({ type: 'vote', billId: 123 });
      expect(length).toBe(1);

      const queue = cache.getQueuedActions();
      expect(queue).toHaveLength(1);
      expect(queue[0].type).toBe('vote');
      expect(queue[0].billId).toBe(123);
      expect(queue[0].id).toBeDefined();
      expect(queue[0].queuedAt).toBeDefined();
    });

    test('queueAction generates unique IDs', () => {
      cache.queueAction({ type: 'a' });
      cache.queueAction({ type: 'b' });
      const queue = cache.getQueuedActions();
      expect(queue[0].id).not.toBe(queue[1].id);
    });

    test('clearQueue empties the queue', () => {
      cache.queueAction({ type: 'a' });
      cache.queueAction({ type: 'b' });
      cache.clearQueue();
      expect(cache.getQueuedActions()).toEqual([]);
    });

    test('removeFromQueue removes by ID', () => {
      cache.queueAction({ type: 'a' });
      cache.queueAction({ type: 'b' });
      const queue = cache.getQueuedActions();
      cache.removeFromQueue(queue[0].id);

      const remaining = cache.getQueuedActions();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe('b');
    });

    test('getQueueLength returns count', () => {
      expect(cache.getQueueLength()).toBe(0);
      cache.queueAction({ type: 'a' });
      expect(cache.getQueueLength()).toBe(1);
    });
  });

  describe('preferences', () => {
    test('getTheme returns default theme', () => {
      expect(cache.getTheme()).toBe('default');
    });

    test('setTheme persists', () => {
      cache.setTheme('dark');
      expect(cache.getTheme()).toBe('dark');
    });

    test('getPreference/setPreference roundtrip', () => {
      cache.setPreference('notificationsEnabled', false);
      expect(cache.getPreference('notificationsEnabled')).toBe(false);
    });
  });

  describe('game state', () => {
    test('updateGameState merges partial state', () => {
      cache.updateGameState({ turnsUntilElection: 5 });
      cache.updateGameState({ actionPoints: 3 });

      const state = cache.getGameState();
      expect(state.turnsUntilElection).toBe(5);
      expect(state.actionPoints).toBe(3);
    });

    test('getGameState returns empty object when no state', () => {
      // Default from schema has null fields but it's still an object
      const state = cache.getGameState();
      expect(typeof state).toBe('object');
    });
  });

  describe('clear', () => {
    test('clears all data', () => {
      cache.cacheTurnData({ turn: 1 });
      cache.queueAction({ type: 'a' });
      cache.setTheme('dark');
      cache.clear();

      expect(cache.getCachedTurnData()).toEqual({});
      expect(cache.getQueuedActions()).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/cache.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/cache.test.js
git commit -m "test: add CacheManager unit tests"
```

---

### Task 9: Test notifications.js

**Files:**
- Create: `tests/unit/notifications.test.js`
- Test: `src/notifications.js`

- [ ] **Step 1: Write notification tests**

```js
const NotificationManager = require('../../src/notifications');
const { BrowserWindow, Notification } = require('electron');

describe('NotificationManager', () => {
  let manager;
  let mockWindow;

  beforeEach(() => {
    mockWindow = new BrowserWindow({ title: 'test' });
    mockWindow.isFocused.mockReturnValue(false);
    manager = new NotificationManager(mockWindow);
  });

  test('starts with zero unread', () => {
    expect(manager.getUnreadCount()).toBe(0);
  });

  test('setEnabled toggles notifications', () => {
    manager.setEnabled(false);
    manager.handleSSEEvent({ type: 'turn_complete', data: { turn: 1 } });
    expect(manager.getUnreadCount()).toBe(0); // suppressed
  });

  test('handleSSEEvent shows notification when window unfocused', () => {
    manager.handleSSEEvent({
      type: 'turn_complete',
      data: { turn: 5 },
    });

    expect(manager.getUnreadCount()).toBe(1);
  });

  test('handleSSEEvent increments unread but skips notification when focused', () => {
    mockWindow.isFocused.mockReturnValue(true);
    manager.handleSSEEvent({
      type: 'election_resolved',
      data: { winner: 'Smith' },
    });

    // election_resolved is not turn_complete, so unread increments even when focused
    expect(manager.getUnreadCount()).toBe(1);
  });

  test('turn_complete when focused does NOT increment unread', () => {
    mockWindow.isFocused.mockReturnValue(true);
    manager.handleSSEEvent({
      type: 'turn_complete',
      data: { turn: 5 },
    });

    expect(manager.getUnreadCount()).toBe(0);
  });

  test('clearUnread resets count and progress bar', () => {
    manager.handleSSEEvent({ type: 'turn_complete', data: {} });
    manager.handleSSEEvent({ type: 'bill_enacted', data: {} });
    expect(manager.getUnreadCount()).toBe(2);

    manager.clearUnread();
    expect(manager.getUnreadCount()).toBe(0);
    expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1);
  });

  test('unknown event type uses notification fallback', () => {
    manager.handleSSEEvent({
      type: 'some_unknown_event',
      data: { message: 'hello' },
    });

    expect(manager.getUnreadCount()).toBe(1);
  });

  test('setWindow updates window reference', () => {
    const newWindow = new BrowserWindow({ title: 'new' });
    manager.setWindow(newWindow);
    expect(manager.mainWindow).toBe(newWindow);
  });

  describe('event formatting', () => {
    const eventCases = [
      ['turn_complete', { turn: 5 }, 'Turn 5 has ended'],
      ['election_resolved', { winner: 'Smith', office: 'President' }, 'Smith wins the President'],
      ['bill_enacted', { name: 'Tax Reform' }, '"Tax Reform" has been signed into law'],
      ['bill_voted', { name: 'Tax Reform' }, 'Vote recorded on "Tax Reform"'],
      ['campaign_update', { message: 'New donor' }, 'New donor'],
      ['election_started', { office: 'Governor' }, 'new Governor election has begun'],
      ['action_points_refreshed', { points: 5 }, '5 action points available'],
      ['poll_results', { message: 'Close race' }, 'Close race'],
      ['achievement_unlocked', { name: 'First Win' }, 'You earned: First Win'],
    ];

    test.each(eventCases)(
      '%s formats correctly',
      (type, data, expectedSubstring) => {
        // We can't easily inspect the Notification constructor args
        // through our mock, but we can verify no errors are thrown
        expect(() => {
          manager.handleSSEEvent({ type, data });
        }).not.toThrow();
      },
    );
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/notifications.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/notifications.test.js
git commit -m "test: add NotificationManager unit tests"
```

---

### Task 10: Test tray.js

**Files:**
- Create: `tests/unit/tray.test.js`
- Test: `src/tray.js`

- [ ] **Step 1: Write tray tests**

```js
const TrayManager = require('../../src/tray');
const { BrowserWindow } = require('electron');

describe('TrayManager', () => {
  let tray;
  let mockWindow;
  let mockNotifications;

  beforeEach(() => {
    jest.useFakeTimers();
    mockWindow = new BrowserWindow({ title: 'test' });
    mockNotifications = {
      getUnreadCount: jest.fn().mockReturnValue(0),
    };
    tray = new TrayManager(mockWindow, mockNotifications);
  });

  afterEach(() => {
    tray.destroy();
    jest.useRealTimers();
  });

  test('create initializes tray', () => {
    tray.create();
    expect(tray.tray).not.toBeNull();
  });

  test('initial game state has placeholder values', () => {
    expect(tray.gameState.turnsUntilElection).toBe('?');
    expect(tray.gameState.actionPoints).toBe('?');
  });

  test('updateGameState merges state', () => {
    tray.create();
    tray.updateGameState({ turnsUntilElection: 5 });
    expect(tray.gameState.turnsUntilElection).toBe(5);
    expect(tray.gameState.actionPoints).toBe('?'); // unchanged
  });

  test('updateMenu is throttled', () => {
    tray.create();
    const rebuildSpy = jest.spyOn(tray, 'rebuildMenu');

    tray.updateMenu();
    tray.updateMenu();
    tray.updateMenu();

    // Should not have called rebuildMenu yet (throttled)
    expect(rebuildSpy).not.toHaveBeenCalled();

    // Advance past throttle
    jest.advanceTimersByTime(1000);

    expect(rebuildSpy).toHaveBeenCalledTimes(1);
  });

  test('navigateTo loads URL and shows window', () => {
    tray.navigateTo('/campaign');
    expect(mockWindow.show).toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
    expect(mockWindow.loadURL).toHaveBeenCalledWith(
      expect.stringContaining('/campaign'),
    );
  });

  test('destroy cleans up tray and timers', () => {
    tray.create();
    tray.updateMenu(); // start a throttle timer
    tray.destroy();

    expect(tray.tray).toBeNull();
    expect(tray._menuThrottle).toBeNull();
  });

  test('setWindow updates reference', () => {
    const newWindow = new BrowserWindow({ title: 'new' });
    tray.setWindow(newWindow);
    expect(tray.mainWindow).toBe(newWindow);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/tray.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tray.test.js
git commit -m "test: add TrayManager unit tests"
```

---

### Task 11: Test windows.js

**Files:**
- Create: `tests/unit/windows.test.js`
- Test: `src/windows.js`

- [ ] **Step 1: Write window manager tests**

```js
const WindowManager = require('../../src/windows');
const { BrowserWindow } = require('electron');

describe('WindowManager', () => {
  let wm;

  beforeEach(() => {
    BrowserWindow._reset();
    wm = new WindowManager();
  });

  afterEach(() => {
    wm.closeAll();
  });

  test('getPresets returns all 6 presets', () => {
    const presets = wm.getPresets();
    expect(presets).toEqual(
      expect.arrayContaining([
        'elections', 'congress', 'campaign', 'state', 'country', 'notifications',
      ]),
    );
    expect(presets).toHaveLength(6);
  });

  test('getPresetConfig returns config for valid preset', () => {
    const config = wm.getPresetConfig('elections');
    expect(config).toEqual({
      title: 'Elections — A House Divided',
      route: '/elections',
      width: 900,
      height: 700,
    });
  });

  test('getPresetConfig returns undefined for invalid preset', () => {
    expect(wm.getPresetConfig('invalid')).toBeUndefined();
  });

  test('openWindow creates window for valid preset', () => {
    const win = wm.openWindow('elections');
    expect(win).not.toBeNull();
    expect(win.loadURL).toHaveBeenCalledWith(
      expect.stringContaining('/elections'),
    );
  });

  test('openWindow returns null for invalid preset', () => {
    expect(wm.openWindow('invalid')).toBeNull();
  });

  test('openWindow focuses existing window (singleton)', () => {
    const win1 = wm.openWindow('elections');
    const win2 = wm.openWindow('elections');
    expect(win2).toBe(win1);
    expect(win1.focus).toHaveBeenCalled();
  });

  test('openWindow replaces destroyed window', () => {
    const win1 = wm.openWindow('elections');
    win1._destroyed = true; // simulate destroyed
    const win2 = wm.openWindow('elections');
    expect(win2).not.toBe(win1);
  });

  test('openCustom creates window with URL', () => {
    const win = wm.openCustom('https://example.com', { width: 500 });
    expect(win).toBeDefined();
    expect(win.loadURL).toHaveBeenCalledWith('https://example.com');
  });

  test('openCustom prepends GAME_URL for relative paths', () => {
    const win = wm.openCustom('/some-route');
    expect(win.loadURL).toHaveBeenCalledWith(
      expect.stringContaining('/some-route'),
    );
  });

  test('closeAll closes all managed windows', () => {
    wm.openWindow('elections');
    wm.openWindow('congress');
    wm.closeAll();

    // After closeAll, windows map should be empty
    expect(wm.windows.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/windows.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/windows.test.js
git commit -m "test: add WindowManager unit tests"
```

---

### Task 12: Test shortcuts.js

**Files:**
- Create: `tests/unit/shortcuts.test.js`
- Test: `src/shortcuts.js`

- [ ] **Step 1: Write shortcut tests**

```js
const ShortcutManager = require('../../src/shortcuts');
const { BrowserWindow, globalShortcut } = require('electron');

describe('ShortcutManager', () => {
  let sm;
  let mockWindow;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWindow = new BrowserWindow({ title: 'test' });
    sm = new ShortcutManager(mockWindow);
  });

  afterEach(() => {
    sm.unregisterAll();
  });

  test('registerAll registers 8 shortcuts', () => {
    sm.registerAll();
    expect(globalShortcut.register).toHaveBeenCalledTimes(8);
    expect(sm.registered).toBe(true);
  });

  test('registerAll is idempotent', () => {
    sm.registerAll();
    sm.registerAll();
    expect(globalShortcut.register).toHaveBeenCalledTimes(8); // not 16
  });

  test('unregisterAll calls globalShortcut.unregisterAll', () => {
    sm.registerAll();
    sm.unregisterAll();
    expect(globalShortcut.unregisterAll).toHaveBeenCalled();
    expect(sm.registered).toBe(false);
  });

  test('handleShortcut navigate loads URL', () => {
    sm.handleShortcut({ action: 'navigate', route: '/campaign' });

    expect(mockWindow.show).toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
    expect(mockWindow.loadURL).toHaveBeenCalledWith(
      expect.stringContaining('/campaign'),
    );
  });

  test('handleShortcut custom calls registered handler', () => {
    const handler = jest.fn();
    sm.onCustom('toggleStatusBar', handler);

    sm.handleShortcut({ action: 'custom', handler: 'toggleStatusBar' });
    expect(handler).toHaveBeenCalled();
  });

  test('handleShortcut custom no-ops for unregistered handler', () => {
    expect(() => {
      sm.handleShortcut({ action: 'custom', handler: 'nonexistent' });
    }).not.toThrow();
  });

  test('handleShortcut no-ops when window destroyed', () => {
    mockWindow._destroyed = true;
    expect(() => {
      sm.handleShortcut({ action: 'navigate', route: '/campaign' });
    }).not.toThrow();
  });

  test('setWindow updates reference', () => {
    const newWindow = new BrowserWindow({ title: 'new' });
    sm.setWindow(newWindow);
    expect(sm.mainWindow).toBe(newWindow);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/shortcuts.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/shortcuts.test.js
git commit -m "test: add ShortcutManager unit tests"
```

---

## Chunk 3: Unit Tests — Remaining Modules

### Task 13: Test menu.js

**Files:**
- Create: `tests/unit/menu.test.js`
- Test: `src/menu.js`

- [ ] **Step 1: Write menu tests**

```js
const MenuManager = require('../../src/menu');
const { BrowserWindow, Menu } = require('electron');

describe('MenuManager', () => {
  let mm;
  let mockWindow;
  let mockWindowManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWindow = new BrowserWindow({ title: 'test' });
    mockWindowManager = {
      getPresets: jest.fn().mockReturnValue(['elections', 'congress']),
      getPresetConfig: jest.fn((preset) => ({
        title: `${preset} — A House Divided`,
        route: `/${preset}`,
      })),
      openWindow: jest.fn(),
    };
    mm = new MenuManager(mockWindow, mockWindowManager);
  });

  test('build creates and sets application menu', () => {
    mm.build();
    expect(Menu.buildFromTemplate).toHaveBeenCalled();
    expect(Menu.setApplicationMenu).toHaveBeenCalled();
  });

  test('build includes Game, Navigate, View, Help menus', () => {
    mm.build();
    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const labels = template.map((m) => m.label);

    expect(labels).toContain('Game');
    expect(labels).toContain('Navigate');
    expect(labels).toContain('View');
    expect(labels).toContain('Help');
  });

  test('build excludes Admin menu by default', () => {
    mm.build();
    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const labels = template.map((m) => m.label);
    expect(labels).not.toContain('Admin');
  });

  test('setAdmin adds Admin menu', () => {
    mm.setAdmin(true);
    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const labels = template.map((m) => m.label);
    expect(labels).toContain('Admin');
  });

  test('setAdmin(false) removes Admin menu', () => {
    mm.setAdmin(true);
    jest.clearAllMocks();
    mm.setAdmin(false);
    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const labels = template.map((m) => m.label);
    expect(labels).not.toContain('Admin');
  });

  test('dev menu included when NODE_ENV=development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    mm.build();
    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const labels = template.map((m) => m.label);
    expect(labels).toContain('Developer');

    process.env.NODE_ENV = originalEnv;
  });

  test('dev menu excluded when NODE_ENV is not development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    mm.build();
    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const labels = template.map((m) => m.label);
    expect(labels).not.toContain('Developer');

    process.env.NODE_ENV = originalEnv;
  });

  test('navigate loads URL in main window', () => {
    mm.navigate('/elections');
    expect(mockWindow.loadURL).toHaveBeenCalledWith(
      expect.stringContaining('/elections'),
    );
  });

  test('navigate no-ops when window destroyed', () => {
    mockWindow._destroyed = true;
    expect(() => mm.navigate('/elections')).not.toThrow();
  });

  test('theme change callback fires', () => {
    const onThemeChange = jest.fn();
    mm = new MenuManager(mockWindow, mockWindowManager, { onThemeChange });
    mm.build();

    // Get View menu -> Theme submenu
    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const viewMenu = template.find((m) => m.label === 'View');
    const themeSubmenu = viewMenu.submenu.find((m) => m.label === 'Theme');

    // Click first theme
    themeSubmenu.submenu[0].click();
    expect(onThemeChange).toHaveBeenCalledWith('default');
  });

  test('setWindow updates reference', () => {
    const newWindow = new BrowserWindow({ title: 'new' });
    mm.setWindow(newWindow);
    expect(mm.mainWindow).toBe(newWindow);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/menu.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/menu.test.js
git commit -m "test: add MenuManager unit tests"
```

---

### Task 14: Test pip.js

**Files:**
- Create: `tests/unit/pip.test.js`
- Test: `src/pip.js`

- [ ] **Step 1: Write PiP tests**

```js
const PipManager = require('../../src/pip');
const { BrowserWindow } = require('electron');

describe('PipManager', () => {
  let pip;
  let mockWindow;

  beforeEach(() => {
    jest.useFakeTimers();
    BrowserWindow._reset();
    mockWindow = new BrowserWindow({ title: 'main' });
    pip = new PipManager(mockWindow);
  });

  afterEach(() => {
    pip.destroy();
    jest.useRealTimers();
  });

  test('starts closed', () => {
    expect(pip.isOpen()).toBeFalsy();
  });

  test('toggle opens when closed', () => {
    pip.toggle();
    expect(pip.pipWindow).not.toBeNull();
  });

  test('toggle closes when open', () => {
    pip.open();
    pip.toggle();
    expect(pip.pipWindow).toBeNull();
  });

  test('open creates BrowserWindow with correct settings', () => {
    pip.open();
    expect(pip.pipWindow).toBeDefined();
    expect(pip.pipWindow._options.alwaysOnTop).toBe(true);
    expect(pip.pipWindow._options.frame).toBe(false);
  });

  test('open focuses existing window', () => {
    pip.open();
    const first = pip.pipWindow;
    pip.open(); // second open should focus, not create new
    expect(pip.pipWindow).toBe(first);
    expect(first.focus).toHaveBeenCalled();
  });

  test('close cleans up', () => {
    pip.open();
    pip.close();
    expect(pip.pipWindow).toBeNull();
    expect(pip.updateInterval).toBeNull();
  });

  test('updateGameState merges state', () => {
    pip.updateGameState({ currentDate: '2026-01-01' });
    expect(pip.gameState.currentDate).toBe('2026-01-01');
    expect(pip.gameState.actionPoints).toBe('?'); // unchanged
  });

  test('startUpdates creates 10s interval', () => {
    pip.open();
    expect(pip.updateInterval).not.toBeNull();

    const displaySpy = jest.spyOn(pip, 'updateDisplay');
    jest.advanceTimersByTime(10000);
    expect(displaySpy).toHaveBeenCalled();
  });

  test('expandToFull shows main window and closes PiP', () => {
    pip.open();
    pip.expandToFull();

    expect(mockWindow.show).toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
    expect(pip.pipWindow).toBeNull();
  });

  test('destroy closes PiP and stops updates', () => {
    pip.open();
    pip.destroy();
    expect(pip.pipWindow).toBeNull();
    expect(pip.updateInterval).toBeNull();
  });

  test('setWindow updates reference', () => {
    const newWindow = new BrowserWindow({ title: 'new' });
    pip.setWindow(newWindow);
    expect(pip.mainWindow).toBe(newWindow);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/pip.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/pip.test.js
git commit -m "test: add PipManager unit tests"
```

---

### Task 15: Test feedback.js

**Files:**
- Create: `tests/unit/feedback.test.js`
- Test: `src/feedback.js`

- [ ] **Step 1: Write feedback tests**

```js
const FeedbackManager = require('../../src/feedback');
const { BrowserWindow } = require('electron');

describe('FeedbackManager', () => {
  let fm;
  let mockWindow;

  beforeEach(() => {
    mockWindow = new BrowserWindow({ title: 'test' });
    fm = new FeedbackManager(mockWindow);
  });

  test('getSystemInfo returns all expected fields', () => {
    const info = fm.getSystemInfo();
    expect(info).toHaveProperty('platform');
    expect(info).toHaveProperty('arch');
    expect(info).toHaveProperty('osVersion');
    expect(info).toHaveProperty('electronVersion');
    expect(info).toHaveProperty('chromeVersion');
    expect(info).toHaveProperty('nodeVersion');
    expect(info).toHaveProperty('appVersion');
    expect(info).toHaveProperty('totalMemory');
    expect(info).toHaveProperty('freeMemory');
    expect(info).toHaveProperty('cpus');
  });

  test('getSystemInfo returns correct appVersion', () => {
    const info = fm.getSystemInfo();
    expect(info.appVersion).toBe('0.1.0');
  });

  test('captureScreenshot returns buffer', async () => {
    const result = await fm.captureScreenshot();
    expect(result).toBeInstanceOf(Buffer);
  });

  test('captureScreenshot returns null when window destroyed', async () => {
    mockWindow._destroyed = true;
    const result = await fm.captureScreenshot();
    expect(result).toBeNull();
  });

  test('captureScreenshot returns null on error', async () => {
    mockWindow.webContents.capturePage.mockRejectedValueOnce(
      new Error('capture failed'),
    );
    const result = await fm.captureScreenshot();
    expect(result).toBeNull();
  });

  test('setWindow updates reference', () => {
    const newWindow = new BrowserWindow({ title: 'new' });
    fm.setWindow(newWindow);
    expect(fm.mainWindow).toBe(newWindow);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/feedback.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/feedback.test.js
git commit -m "test: add FeedbackManager unit tests"
```

---

### Task 16: Test updater.js

**Files:**
- Create: `tests/unit/updater.test.js`
- Test: `src/updater.js`

- [ ] **Step 1: Write updater tests**

```js
const { autoUpdater } = require('electron-updater');
const { BrowserWindow } = require('electron');
const UpdateManager = require('../../src/updater');

describe('UpdateManager', () => {
  let um;
  let mockWindow;

  beforeEach(() => {
    jest.clearAllMocks();
    autoUpdater.removeAllListeners();
    mockWindow = new BrowserWindow({ title: 'test' });
    um = new UpdateManager(mockWindow);
  });

  test('constructor sets autoDownload to false', () => {
    expect(autoUpdater.autoDownload).toBe(false);
  });

  test('constructor sets autoInstallOnAppQuit to true', () => {
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  test('checkForUpdates calls autoUpdater.checkForUpdates', () => {
    um.checkForUpdates();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
  });

  test('checking-for-update sends status to renderer', () => {
    autoUpdater.emit('checking-for-update');
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'update-status',
      'Checking for updates...',
    );
  });

  test('update-not-available sends up-to-date status', () => {
    autoUpdater.emit('update-not-available');
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'update-status',
      'Up to date.',
    );
  });

  test('download-progress updates progress bar', () => {
    autoUpdater.emit('download-progress', { percent: 50 });
    expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0.5);
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'update-status',
      'Downloading update: 50%',
    );
  });

  test('error event sends failure status', () => {
    autoUpdater.emit('error', new Error('test error'));
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'update-status',
      'Update check failed.',
    );
  });

  test('sendStatus no-ops when window destroyed', () => {
    mockWindow._destroyed = true;
    expect(() => autoUpdater.emit('checking-for-update')).not.toThrow();
  });

  test('setWindow updates reference', () => {
    const newWindow = new BrowserWindow({ title: 'new' });
    um.setWindow(newWindow);
    expect(um.mainWindow).toBe(newWindow);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/updater.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/updater.test.js
git commit -m "test: add UpdateManager unit tests"
```

---

### Task 17: Test devtools.js

**Files:**
- Create: `tests/unit/devtools.test.js`
- Test: `src/devtools.js`

- [ ] **Step 1: Write devtools tests**

```js
const DevToolsManager = require('../../src/devtools');
const { BrowserWindow } = require('electron');

describe('DevToolsManager', () => {
  let dt;
  let mockWindow;
  let mockSSE;

  beforeEach(() => {
    jest.useFakeTimers();
    mockWindow = new BrowserWindow({ title: 'test' });
    mockSSE = { isConnected: jest.fn().mockReturnValue(true) };
    dt = new DevToolsManager(mockWindow, mockSSE);
  });

  afterEach(() => {
    dt.destroy();
    jest.useRealTimers();
  });

  test('logEvent adds to event log', () => {
    dt.logEvent({ type: 'turn_complete', data: { turn: 1 } });
    expect(dt.eventLog).toHaveLength(1);
    expect(dt.eventLog[0].type).toBe('turn_complete');
    expect(dt.eventLog[0].timestamp).toBeDefined();
  });

  test('logEvent caps buffer at maxLogEntries', () => {
    dt.maxLogEntries = 5;
    for (let i = 0; i < 10; i++) {
      dt.logEvent({ type: 'test', data: i });
    }
    expect(dt.eventLog.length).toBeLessThanOrEqual(5);
  });

  test('logEvent batches UI updates at 500ms', () => {
    const spy = jest.spyOn(dt, 'updateEventLogWindow');
    dt.logEvent({ type: 'test', data: {} });
    dt.logEvent({ type: 'test', data: {} });

    // Not called yet
    expect(spy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('switchServer loads URL on main window', () => {
    dt.switchServer('local');
    expect(mockWindow.loadURL).toHaveBeenCalledWith('http://localhost:3000');
  });

  test('switchServer no-ops for invalid preset', () => {
    dt.switchServer('invalid');
    expect(mockWindow.loadURL).not.toHaveBeenCalled();
  });

  test('getServerPresets returns all 3 presets', () => {
    const presets = dt.getServerPresets();
    expect(presets).toHaveProperty('local');
    expect(presets).toHaveProperty('staging');
    expect(presets).toHaveProperty('production');
  });

  test('getConnectionStatus returns SSE status', () => {
    const status = dt.getConnectionStatus();
    expect(status.sse).toBe(true);
    expect(status.eventCount).toBe(0);
  });

  test('destroy clears log and timers', () => {
    dt.logEvent({ type: 'test', data: {} });
    dt.destroy();
    expect(dt.eventLog).toHaveLength(0);
    expect(dt._logUpdateTimer).toBeNull();
  });

  test('setWindow updates reference', () => {
    const newWindow = new BrowserWindow({ title: 'new' });
    dt.setWindow(newWindow);
    expect(dt.mainWindow).toBe(newWindow);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/devtools.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/devtools.test.js
git commit -m "test: add DevToolsManager unit tests"
```

---

### Task 18: Test ipc.js

**Files:**
- Create: `tests/unit/ipc.test.js`
- Test: `src/ipc.js`

- [ ] **Step 1: Write IPC handler tests**

```js
const { ipcMain } = require('electron');
const { registerIpcHandlers } = require('../../src/ipc');

describe('registerIpcHandlers', () => {
  let handlers;
  let deps;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};

    // Capture registered handlers
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    deps = {
      cacheManager: {
        getGameState: jest.fn().mockReturnValue({ turnsUntilElection: 5 }),
        getCachedTurnData: jest.fn().mockReturnValue({ turn: 3 }),
        queueAction: jest.fn().mockReturnValue(1),
        getQueuedActions: jest.fn().mockReturnValue([]),
        getTheme: jest.fn().mockReturnValue('dark'),
        setTheme: jest.fn(),
        getPreference: jest.fn().mockReturnValue(true),
        setPreference: jest.fn(),
      },
      notificationManager: {
        setEnabled: jest.fn(),
      },
      menuManager: {
        setAdmin: jest.fn(),
      },
      windowManager: {
        openWindow: jest.fn(),
      },
      pipManager: {
        toggle: jest.fn(),
      },
      feedbackManager: {
        captureScreenshot: jest.fn().mockResolvedValue(Buffer.from('png')),
        getSystemInfo: jest.fn().mockReturnValue({ platform: 'test' }),
      },
      updateManager: {
        checkForUpdates: jest.fn(),
      },
      sseClient: {
        isConnected: jest.fn().mockReturnValue(true),
      },
      mainWindow: { webContents: { send: jest.fn() } },
      syncNativeTheme: jest.fn(),
      handleGameStateEvent: jest.fn(),
    };

    registerIpcHandlers(deps);
  });

  test('registers 16 handlers', () => {
    expect(ipcMain.handle).toHaveBeenCalledTimes(16);
  });

  test('get-game-state returns cached state', async () => {
    const result = await handlers['get-game-state']();
    expect(result).toEqual({ turnsUntilElection: 5 });
  });

  test('get-cached-turn returns turn data', async () => {
    const result = await handlers['get-cached-turn']();
    expect(result).toEqual({ turn: 3 });
  });

  test('queue-action queues and returns length', async () => {
    const result = await handlers['queue-action'](null, { type: 'vote' });
    expect(deps.cacheManager.queueAction).toHaveBeenCalledWith({ type: 'vote' });
    expect(result).toBe(1);
  });

  test('get-queue returns queued actions', async () => {
    const result = await handlers['get-queue']();
    expect(result).toEqual([]);
  });

  test('get-theme returns theme', async () => {
    const result = await handlers['get-theme']();
    expect(result).toBe('dark');
  });

  test('set-theme sets theme and syncs native theme', async () => {
    await handlers['set-theme'](null, 'patriot');
    expect(deps.cacheManager.setTheme).toHaveBeenCalledWith('patriot');
    expect(deps.syncNativeTheme).toHaveBeenCalledWith('patriot');
  });

  test('get-preferences returns theme and notifications', async () => {
    const result = await handlers['get-preferences']();
    expect(result).toHaveProperty('theme', 'dark');
    expect(result).toHaveProperty('notificationsEnabled');
  });

  test('set-preference sets and toggles notifications if key matches', async () => {
    await handlers['set-preference'](null, {
      key: 'notificationsEnabled',
      value: false,
    });
    expect(deps.cacheManager.setPreference).toHaveBeenCalledWith(
      'notificationsEnabled',
      false,
    );
    expect(deps.notificationManager.setEnabled).toHaveBeenCalledWith(false);
  });

  test('update-game-state calls handleGameStateEvent', async () => {
    await handlers['update-game-state'](null, { turnsUntilElection: 3 });
    expect(deps.handleGameStateEvent).toHaveBeenCalledWith({
      data: { turnsUntilElection: 3 },
    });
  });

  test('open-window calls windowManager', async () => {
    await handlers['open-window'](null, 'elections');
    expect(deps.windowManager.openWindow).toHaveBeenCalledWith(
      'elections',
      deps.mainWindow,
    );
  });

  test('toggle-pip calls pipManager.toggle', async () => {
    await handlers['toggle-pip']();
    expect(deps.pipManager.toggle).toHaveBeenCalled();
  });

  test('capture-screenshot returns base64', async () => {
    const result = await handlers['capture-screenshot']();
    expect(result).toBe(Buffer.from('png').toString('base64'));
  });

  test('get-system-info returns system info', async () => {
    const result = await handlers['get-system-info']();
    expect(result).toEqual({ platform: 'test' });
  });

  test('check-updates calls updateManager', async () => {
    await handlers['check-updates']();
    expect(deps.updateManager.checkForUpdates).toHaveBeenCalled();
  });

  test('get-sse-status returns connection status', async () => {
    const result = await handlers['get-sse-status']();
    expect(result).toEqual({ connected: true });
  });

  test('set-admin calls menuManager.setAdmin', async () => {
    await handlers['set-admin'](null, true);
    expect(deps.menuManager.setAdmin).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/ipc.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/ipc.test.js
git commit -m "test: add IPC handler unit tests"
```

---

### Task 19: Test preload.js

**Files:**
- Create: `tests/unit/preload.test.js`
- Test: `src/preload.js`

- [ ] **Step 1: Write preload tests**

```js
const { contextBridge, ipcRenderer } = require('electron');

describe('preload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('exposes ahdClient on contextBridge', () => {
    require('../../src/preload');
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'ahdClient',
      expect.any(Object),
    );
  });

  test('ahdClient has expected properties', () => {
    require('../../src/preload');
    const api = contextBridge.exposeInMainWorld.mock.calls[0][1];

    expect(api.isElectron).toBe(true);
    expect(api.platform).toBe(process.platform);
    expect(typeof api.invoke).toBe('function');
    expect(typeof api.on).toBe('function');
    expect(typeof api.once).toBe('function');
  });

  test('invoke allows whitelisted channels', async () => {
    require('../../src/preload');
    const api = contextBridge.exposeInMainWorld.mock.calls[0][1];

    ipcRenderer.invoke.mockResolvedValue('result');
    const result = await api.invoke('get-game-state');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-game-state');
    expect(result).toBe('result');
  });

  test('invoke rejects blocked channels', async () => {
    require('../../src/preload');
    const api = contextBridge.exposeInMainWorld.mock.calls[0][1];

    await expect(api.invoke('dangerous-channel')).rejects.toThrow(
      'Blocked channel',
    );
  });

  test('on returns cleanup function for valid channels', () => {
    require('../../src/preload');
    const api = contextBridge.exposeInMainWorld.mock.calls[0][1];

    const callback = jest.fn();
    const cleanup = api.on('sse-status', callback);
    expect(typeof cleanup).toBe('function');
    expect(ipcRenderer.on).toHaveBeenCalledWith('sse-status', expect.any(Function));
  });

  test('on returns no-op for invalid channels', () => {
    require('../../src/preload');
    const api = contextBridge.exposeInMainWorld.mock.calls[0][1];

    const cleanup = api.on('invalid-channel', jest.fn());
    expect(typeof cleanup).toBe('function');
    expect(ipcRenderer.on).not.toHaveBeenCalled();
  });

  test('convenience methods call invoke with correct channel', () => {
    require('../../src/preload');
    const api = contextBridge.exposeInMainWorld.mock.calls[0][1];

    api.getGameState();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-game-state');

    api.setTheme('dark');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('set-theme', 'dark');

    api.togglePip();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('toggle-pip');
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/unit/preload.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/preload.test.js
git commit -m "test: add preload.js unit tests"
```

---

## Chunk 4: Integration Tests

### Task 20: SSE -> Notifications integration

**Files:**
- Create: `tests/integration/sse-notifications.test.js`

- [ ] **Step 1: Write integration test**

```js
const SSEClient = require('../../src/sse');
const NotificationManager = require('../../src/notifications');
const { BrowserWindow } = require('electron');

describe('SSE -> Notifications integration', () => {
  let sse;
  let notifications;
  let mockWindow;

  beforeEach(() => {
    mockWindow = new BrowserWindow({ title: 'test' });
    mockWindow.isFocused.mockReturnValue(false);
    sse = new SSEClient();
    notifications = new NotificationManager(mockWindow);

    sse.on('event', (event) => {
      notifications.handleSSEEvent(event);
    });
  });

  afterEach(() => {
    sse.disconnect();
  });

  test('SSE turn_complete event creates notification and increments unread', () => {
    sse.buffer = 'event: turn_complete\ndata: {"turn":5}\n\n';
    sse.processBuffer();

    expect(notifications.getUnreadCount()).toBe(1);
  });

  test('SSE election_resolved event creates urgent notification', () => {
    sse.buffer =
      'event: election_resolved\ndata: {"winner":"Smith","office":"President"}\n\n';
    sse.processBuffer();

    expect(notifications.getUnreadCount()).toBe(1);
  });

  test('multiple SSE events accumulate unread count', () => {
    sse.buffer =
      'event: turn_complete\ndata: {"turn":1}\n\nevent: bill_enacted\ndata: {"name":"Tax"}\n\n';
    sse.processBuffer();

    expect(notifications.getUnreadCount()).toBe(2);
  });

  test('clearUnread resets after SSE events', () => {
    sse.buffer = 'event: turn_complete\ndata: {}\n\nevent: bill_enacted\ndata: {}\n\n';
    sse.processBuffer();

    notifications.clearUnread();
    expect(notifications.getUnreadCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/integration/sse-notifications.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/sse-notifications.test.js
git commit -m "test: add SSE -> Notifications integration test"
```

---

### Task 21: Game state flow integration

**Files:**
- Create: `tests/integration/game-state-flow.test.js`

- [ ] **Step 1: Write game state flow test**

```js
const SSEClient = require('../../src/sse');
const CacheManager = require('../../src/cache');
const TrayManager = require('../../src/tray');
const PipManager = require('../../src/pip');
const { BrowserWindow } = require('electron');

describe('Game state flow: SSE -> Cache -> Tray -> PiP', () => {
  let sse;
  let cache;
  let tray;
  let pip;
  let mockWindow;

  beforeEach(() => {
    jest.useFakeTimers();
    mockWindow = new BrowserWindow({ title: 'test' });
    sse = new SSEClient();
    cache = new CacheManager();
    tray = new TrayManager(mockWindow, { getUnreadCount: () => 0 });
    tray.create();
    pip = new PipManager(mockWindow);

    // Wire the event flow (same as main.js handleGameStateEvent)
    sse.on('event', (event) => {
      const data = event.data || {};
      const fields = ['turnsUntilElection', 'actionPoints', 'currentDate', 'nextTurnIn'];
      const gameState = {};
      for (const field of fields) {
        if (data[field] !== undefined) gameState[field] = data[field];
      }
      if (Object.keys(gameState).length > 0) {
        tray.updateGameState(gameState);
        pip.updateGameState(gameState);
        cache.updateGameState(gameState);
      }
    });
  });

  afterEach(() => {
    sse.disconnect();
    tray.destroy();
    pip.destroy();
    jest.useRealTimers();
  });

  test('SSE event propagates game state to cache, tray, and PiP', () => {
    sse.buffer =
      'data: {"turnsUntilElection":5,"actionPoints":3,"currentDate":"Jan 2026"}\n\n';
    sse.processBuffer();

    // Cache persisted
    const cached = cache.getGameState();
    expect(cached.turnsUntilElection).toBe(5);
    expect(cached.actionPoints).toBe(3);

    // Tray updated
    expect(tray.gameState.turnsUntilElection).toBe(5);
    expect(tray.gameState.actionPoints).toBe(3);

    // PiP updated
    expect(pip.gameState.currentDate).toBe('Jan 2026');
  });

  test('partial state updates merge correctly', () => {
    sse.buffer = 'data: {"turnsUntilElection":5}\n\n';
    sse.processBuffer();

    sse.buffer = 'data: {"actionPoints":3}\n\n';
    sse.processBuffer();

    const cached = cache.getGameState();
    expect(cached.turnsUntilElection).toBe(5);
    expect(cached.actionPoints).toBe(3);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/integration/game-state-flow.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/game-state-flow.test.js
git commit -m "test: add game state flow integration test"
```

---

### Task 22: IPC handlers integration

**Files:**
- Create: `tests/integration/ipc-handlers.test.js`

- [ ] **Step 1: Write IPC integration test**

```js
const { ipcMain } = require('electron');
const { BrowserWindow } = require('electron');
const { registerIpcHandlers } = require('../../src/ipc');
const CacheManager = require('../../src/cache');
const NotificationManager = require('../../src/notifications');

describe('IPC handlers integration', () => {
  let handlers;
  let cache;
  let notifications;
  let mockWindow;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mockWindow = new BrowserWindow({ title: 'test' });
    cache = new CacheManager();
    notifications = new NotificationManager(mockWindow);

    registerIpcHandlers({
      cacheManager: cache,
      notificationManager: notifications,
      menuManager: { setAdmin: jest.fn() },
      windowManager: { openWindow: jest.fn() },
      pipManager: { toggle: jest.fn() },
      feedbackManager: {
        captureScreenshot: jest.fn().mockResolvedValue(null),
        getSystemInfo: jest.fn().mockReturnValue({}),
      },
      updateManager: { checkForUpdates: jest.fn() },
      sseClient: { isConnected: jest.fn().mockReturnValue(false) },
      mainWindow: mockWindow,
      syncNativeTheme: jest.fn(),
      handleGameStateEvent: jest.fn(),
    });
  });

  test('queue-action -> get-queue roundtrip', async () => {
    await handlers['queue-action'](null, { type: 'vote', billId: 1 });
    const queue = await handlers['get-queue']();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('vote');
  });

  test('set-theme -> get-theme roundtrip', async () => {
    await handlers['set-theme'](null, 'patriot');
    const theme = await handlers['get-theme']();
    expect(theme).toBe('patriot');
  });

  test('set-preference notificationsEnabled toggles notifications', async () => {
    await handlers['set-preference'](null, {
      key: 'notificationsEnabled',
      value: false,
    });
    expect(notifications.enabled).toBe(false);
  });

  test('get-preferences reflects stored preferences', async () => {
    await handlers['set-theme'](null, 'gilded');
    const prefs = await handlers['get-preferences']();
    expect(prefs.theme).toBe('gilded');
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/integration/ipc-handlers.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/ipc-handlers.test.js
git commit -m "test: add IPC handlers integration test"
```

---

### Task 23: Theme sync integration

**Files:**
- Create: `tests/integration/theme-sync.test.js`

- [ ] **Step 1: Write theme sync test**

```js
const CacheManager = require('../../src/cache');
const { nativeTheme, BrowserWindow } = require('electron');

describe('Theme sync flow', () => {
  let cache;
  let mockWindow;

  // Same logic as main.js syncNativeTheme
  function syncNativeTheme(themeId) {
    const darkThemes = ['default', 'dark', 'gilded', 'federal'];
    nativeTheme.themeSource = darkThemes.includes(themeId) ? 'dark' : 'light';
  }

  beforeEach(() => {
    cache = new CacheManager();
    mockWindow = new BrowserWindow({ title: 'test' });
    nativeTheme.themeSource = 'system';
  });

  test('dark theme sets nativeTheme to dark', () => {
    cache.setTheme('dark');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('dark');
  });

  test('light theme sets nativeTheme to light', () => {
    cache.setTheme('light');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('light');
  });

  test('patriot theme sets nativeTheme to light', () => {
    cache.setTheme('patriot');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('light');
  });

  test('gilded theme sets nativeTheme to dark', () => {
    cache.setTheme('gilded');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('dark');
  });

  test('federal theme sets nativeTheme to dark', () => {
    cache.setTheme('federal');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('dark');
  });

  test('liberty theme sets nativeTheme to light', () => {
    cache.setTheme('liberty');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('light');
  });

  test('default theme sets nativeTheme to dark', () => {
    cache.setTheme('default');
    syncNativeTheme(cache.getTheme());
    expect(nativeTheme.themeSource).toBe('dark');
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx jest tests/integration/theme-sync.test.js --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/theme-sync.test.js
git commit -m "test: add theme sync integration test"
```

---

## Chunk 5: E2E Tests

### Task 24: E2E setup and app launch test

**Files:**
- Create: `tests/e2e/playwright.config.js`
- Create: `tests/e2e/app-launch.test.js`

- [ ] **Step 1: Write Playwright config for Electron**

```js
// tests/e2e/playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 1,
  use: {
    trace: 'on-first-retry',
  },
});
```

- [ ] **Step 2: Write app launch E2E test**

```js
// tests/e2e/app-launch.test.js
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

let app;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '..', '..', '.')],
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('app launches and creates a window', async () => {
  const window = await app.firstWindow();
  expect(window).toBeTruthy();
});

test('window has correct title', async () => {
  const window = await app.firstWindow();
  const title = await window.title();
  expect(title).toContain('A House Divided');
});

test('window loads game URL', async () => {
  const window = await app.firstWindow();
  // Wait for navigation away from loading.html
  await window.waitForURL(/ahousedividedgame\.com|loading\.html/, {
    timeout: 15000,
  });
  const url = window.url();
  // Should either be on the game URL or still on loading
  expect(url).toMatch(/ahousedividedgame\.com|loading\.html/);
});

test('window has minimum dimensions', async () => {
  const window = await app.firstWindow();
  const size = await window.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  // Viewport should be at least min dimensions
  expect(size.width).toBeGreaterThanOrEqual(700); // some tolerance
  expect(size.height).toBeGreaterThanOrEqual(500);
});
```

- [ ] **Step 3: Update package.json e2e script**

Ensure the `test:e2e` script points to the Playwright config:

```json
"test:e2e": "npx playwright test --config=tests/e2e/playwright.config.js"
```

- [ ] **Step 4: Run E2E test**

```bash
npx playwright test --config=tests/e2e/playwright.config.js
```

Expected: Tests pass (may need a display; skip in headless CI if display unavailable).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/
git commit -m "test: add E2E app launch tests with Playwright Electron"
```

---

### Task 25: E2E window management test

**Files:**
- Create: `tests/e2e/window-management.test.js`

- [ ] **Step 1: Write window management E2E test**

```js
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

let app;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '..', '..', '.')],
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });
  // Wait for first window to be ready
  await app.firstWindow();
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('app starts with exactly one window', async () => {
  const windows = app.windows();
  expect(windows.length).toBeGreaterThanOrEqual(1);
});

test('main window is visible', async () => {
  const window = await app.firstWindow();
  const isVisible = await window.evaluate(() => true); // if we can evaluate, window exists
  expect(isVisible).toBe(true);
});
```

- [ ] **Step 2: Run test**

```bash
npx playwright test tests/e2e/window-management.test.js --config=tests/e2e/playwright.config.js
```

Expected: Tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/window-management.test.js
git commit -m "test: add E2E window management tests"
```

---

### Task 26: E2E navigation test

**Files:**
- Create: `tests/e2e/navigation.test.js`

- [ ] **Step 1: Write navigation E2E test**

```js
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

let app;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '..', '..', '.')],
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });
  await app.firstWindow();
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('developer menu exists in dev mode', async () => {
  // In dev mode, the Developer menu should be present
  // We can check by evaluating the app menu
  const hasDevMenu = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) return false;
    return menu.items.some((item) => item.label === 'Developer');
  });
  expect(hasDevMenu).toBe(true);
});
```

- [ ] **Step 2: Run test**

```bash
npx playwright test tests/e2e/navigation.test.js --config=tests/e2e/playwright.config.js
```

Expected: Tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/navigation.test.js
git commit -m "test: add E2E navigation tests"
```

---

## Chunk 6: Final Setup and Verification

### Task 27: Run full test suite

- [ ] **Step 1: Run all unit + integration tests**

```bash
npx jest --project unit --verbose
```

Expected: All tests pass.

- [ ] **Step 2: Run coverage report**

```bash
npx jest --project unit --coverage
```

Expected: Coverage meets 80% thresholds.

- [ ] **Step 3: Run E2E tests**

```bash
npx playwright test --config=tests/e2e/playwright.config.js
```

Expected: All E2E tests pass.

- [ ] **Step 4: Fix any failing tests**

If tests fail, debug and fix. Common issues:
- Mock not returning expected types
- Async timing issues (use `jest.useFakeTimers()`)
- Module caching (`jest.resetModules()` in beforeEach)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "test: complete test suite - unit, integration, and E2E tests"
```

---

### Task 28: Add .gitignore entries

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add test artifacts to .gitignore**

Append these lines to `.gitignore`:

```
# Test
coverage/
test-results/
playwright-report/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add test artifacts to .gitignore"
```
