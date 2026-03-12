'use strict';

describe('preload', () => {
  let contextBridge;
  let ipcRenderer;
  let api;

  beforeEach(() => {
    jest.resetModules();

    // Re-require the electron mock so we get fresh references after resetModules
    const electron = require('electron');
    contextBridge = electron.contextBridge;
    ipcRenderer = electron.ipcRenderer;

    // Load preload to trigger exposeInMainWorld
    require('../../src/preload');

    // Capture the api object passed to exposeInMainWorld
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'ahdClient',
      expect.any(Object),
    );
    api = contextBridge.exposeInMainWorld.mock.calls[0][1];
  });

  // --- Bootstrapping ---

  test('exposeInMainWorld is called with "ahdClient"', () => {
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'ahdClient',
      expect.any(Object),
    );
  });

  // --- Static properties ---

  test('api.isElectron === true', () => {
    expect(api.isElectron).toBe(true);
  });

  test('api.platform === process.platform', () => {
    expect(api.platform).toBe(process.platform);
  });

  // --- invoke: allowed channels ---

  test('api.invoke("get-game-state") calls ipcRenderer.invoke("get-game-state")', () => {
    api.invoke('get-game-state');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-game-state');
  });

  test('api.invoke("theme-changed-on-site", "dark") calls ipcRenderer.invoke with correct args', () => {
    api.invoke('theme-changed-on-site', 'dark');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'theme-changed-on-site',
      'dark',
    );
  });

  // --- invoke: blocked channels ---

  test('api.invoke("dangerous-channel") rejects with "Blocked channel" error', async () => {
    await expect(api.invoke('dangerous-channel')).rejects.toThrow(
      'Blocked channel',
    );
  });

  // --- on: allowed channels ---

  test('api.on("sse-status", fn) calls ipcRenderer.on and returns a cleanup function', () => {
    const fn = jest.fn();
    const cleanup = api.on('sse-status', fn);

    expect(ipcRenderer.on).toHaveBeenCalledWith(
      'sse-status',
      expect.any(Function),
    );
    expect(typeof cleanup).toBe('function');
  });

  test('cleanup function returned by api.on calls ipcRenderer.removeListener', () => {
    const fn = jest.fn();
    const cleanup = api.on('sse-status', fn);

    // Get the listener that was registered
    const registeredListener = ipcRenderer.on.mock.calls[0][1];
    cleanup();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      'sse-status',
      registeredListener,
    );
  });

  // --- New channels (client-nav, go-home) ---

  test('api.on("client-nav", fn) calls ipcRenderer.on and returns cleanup', () => {
    const fn = jest.fn();
    const cleanup = api.on('client-nav', fn);
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      'client-nav',
      expect.any(Function),
    );
    expect(typeof cleanup).toBe('function');
  });

  test('api.invoke("go-home") calls ipcRenderer.invoke("go-home")', () => {
    api.invoke('go-home');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('go-home');
  });

  test('api.goHome() calls ipcRenderer.invoke("go-home")', () => {
    api.goHome();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('go-home');
  });

  // --- on: invalid channels ---

  test('api.on("invalid-channel", fn) returns no-op and does NOT call ipcRenderer.on', () => {
    const fn = jest.fn();
    const result = api.on('invalid-channel', fn);

    expect(ipcRenderer.on).not.toHaveBeenCalled();
    expect(typeof result).toBe('function');
    // Calling the no-op should not throw
    expect(() => result()).not.toThrow();
  });

  // --- Convenience methods ---

  test('api.getGameState() calls ipcRenderer.invoke("get-game-state")', () => {
    api.getGameState();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-game-state');
  });

  test('api.setTheme("dark") calls ipcRenderer.invoke("set-theme", "dark")', () => {
    api.setTheme('dark');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('set-theme', 'dark');
  });
});
