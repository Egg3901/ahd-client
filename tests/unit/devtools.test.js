const { BrowserWindow } = require('electron');
const DevToolsManager = require('../../src/devtools');

describe('DevToolsManager', () => {
  let mainWindow;
  let sseClient;
  let manager;

  beforeEach(() => {
    mainWindow = new BrowserWindow();
    sseClient = {
      isConnected: jest.fn().mockReturnValue(true),
      connect: jest.fn(),
    };
    manager = new DevToolsManager(mainWindow, sseClient);
  });

  // --- logEvent: adds entry ---

  test('logEvent adds an entry with type and timestamp to eventLog', () => {
    manager.logEvent({ type: 'turn_complete', data: { turn: 1 } });

    expect(manager.eventLog).toHaveLength(1);
    expect(manager.eventLog[0].type).toBe('turn_complete');
    expect(manager.eventLog[0].timestamp).toBeDefined();
    expect(typeof manager.eventLog[0].timestamp).toBe('string');
  });

  test('logEvent stores event data on the entry', () => {
    const data = { turn: 5 };
    manager.logEvent({ type: 'turn_complete', data });

    expect(manager.eventLog[0].data).toEqual(data);
  });

  // --- logEvent: caps at maxLogEntries ---

  test('logEvent caps eventLog at maxLogEntries', () => {
    manager.maxLogEntries = 5;

    for (let i = 0; i < 10; i++) {
      manager.logEvent({ type: `event_${i}`, data: i });
    }

    expect(manager.eventLog).toHaveLength(5);
  });

  test('logEvent keeps the most recent entries when capping', () => {
    manager.maxLogEntries = 5;

    for (let i = 0; i < 10; i++) {
      manager.logEvent({ type: `event_${i}`, data: i });
    }

    // The last 5 entries (events 5-9) should be retained
    expect(manager.eventLog[0].type).toBe('event_5');
    expect(manager.eventLog[4].type).toBe('event_9');
  });

  // --- logEvent: batches UI updates (panelWindow path) ---

  test('logEvent with no panelWindow does not throw', () => {
    expect(() => manager.logEvent({ type: 'test', data: null })).not.toThrow();
  });

  test('logEvent pushes to panelWindow when it is open', () => {
    // Simulate an open panel window
    manager.panelWindow = new BrowserWindow();

    manager.logEvent({ type: 'sse_event', data: 42 });

    expect(manager.panelWindow.webContents.send).toHaveBeenCalledWith(
      'dev-sse-event',
      expect.objectContaining({ type: 'sse_event' }),
    );
  });

  // --- switchServer ---

  test("switchServer('local') calls mainWindow.loadURL with localhost URL", () => {
    manager.switchServer('local');
    expect(mainWindow.loadURL).toHaveBeenCalledWith('http://localhost:3000');
  });

  test("switchServer('staging') calls mainWindow.loadURL with staging URL", () => {
    manager.switchServer('staging');
    expect(mainWindow.loadURL).toHaveBeenCalledWith(
      'https://staging.ahousedividedgame.com',
    );
  });

  test("switchServer('production') calls mainWindow.loadURL with production URL", () => {
    manager.switchServer('production');
    expect(mainWindow.loadURL).toHaveBeenCalledWith(
      'https://ahousedividedgame.com',
    );
  });

  test("switchServer('invalid') does not call loadURL", () => {
    manager.switchServer('invalid');
    expect(mainWindow.loadURL).not.toHaveBeenCalled();
  });

  test('switchServer does not call loadURL when mainWindow is destroyed', () => {
    mainWindow._destroyed = true;
    manager.switchServer('local');
    expect(mainWindow.loadURL).not.toHaveBeenCalled();
  });

  // --- getServerPresets ---

  test('getServerPresets returns an object with local, staging, and production keys', () => {
    const presets = manager.getServerPresets();

    expect(presets).toHaveProperty('local');
    expect(presets).toHaveProperty('staging');
    expect(presets).toHaveProperty('production');
  });

  test('getServerPresets returns correct URLs', () => {
    const presets = manager.getServerPresets();

    expect(presets.local).toBe('http://localhost:3000');
    expect(presets.staging).toBe('https://staging.ahousedividedgame.com');
    expect(presets.production).toBe('https://ahousedividedgame.com');
  });

  // --- getConnectionStatus ---

  test('getConnectionStatus returns object with sse boolean and eventCount number', () => {
    const status = manager.getConnectionStatus();

    expect(typeof status.sse).toBe('boolean');
    expect(typeof status.eventCount).toBe('number');
  });

  test('getConnectionStatus reflects sseClient.isConnected()', () => {
    sseClient.isConnected.mockReturnValue(true);
    expect(manager.getConnectionStatus().sse).toBe(true);

    sseClient.isConnected.mockReturnValue(false);
    expect(manager.getConnectionStatus().sse).toBe(false);
  });

  test('getConnectionStatus eventCount reflects current eventLog length', () => {
    expect(manager.getConnectionStatus().eventCount).toBe(0);

    manager.logEvent({ type: 'a', data: 1 });
    manager.logEvent({ type: 'b', data: 2 });

    expect(manager.getConnectionStatus().eventCount).toBe(2);
  });

  test('getConnectionStatus returns sse: false when sseClient is null', () => {
    const mgr = new DevToolsManager(mainWindow, null);
    expect(mgr.getConnectionStatus().sse).toBe(false);
  });

  // --- destroy ---

  test('destroy clears eventLog', () => {
    manager.logEvent({ type: 'test', data: 1 });
    manager.logEvent({ type: 'test', data: 2 });

    manager.destroy();

    expect(manager.eventLog).toHaveLength(0);
  });

  test('destroy clears ipcLog', () => {
    manager._logIpcCall({
      channel: 'test',
      args: [],
      result: null,
      durationMs: 1,
      timestamp: new Date().toISOString(),
    });

    manager.destroy();

    expect(manager.ipcLog).toHaveLength(0);
  });

  test('destroy does not throw when panelWindow is null', () => {
    manager.panelWindow = null;
    expect(() => manager.destroy()).not.toThrow();
  });

  // --- setWindow ---

  test('setWindow updates the mainWindow reference', () => {
    const newWindow = new BrowserWindow();
    manager.setWindow(newWindow);
    expect(manager.mainWindow).toBe(newWindow);
  });

  test('setWindow causes switchServer to target the new window', () => {
    const newWindow = new BrowserWindow();
    manager.setWindow(newWindow);

    manager.switchServer('local');

    // loadURL is on the prototype so both instances share the same mock fn;
    // verify it was called with the correct URL exactly once.
    expect(newWindow.loadURL).toHaveBeenCalledWith('http://localhost:3000');
    expect(newWindow.loadURL).toHaveBeenCalledTimes(1);
  });
});
