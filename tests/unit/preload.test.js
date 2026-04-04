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

  // --- Action queue channels ---

  test('api.on("action-failed", fn) registers on ipcRenderer', () => {
    const fn = jest.fn();
    const cleanup = api.on('action-failed', fn);
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      'action-failed',
      expect.any(Function),
    );
    expect(typeof cleanup).toBe('function');
  });

  test('api.invoke("action-result", payload) calls ipcRenderer.invoke', () => {
    api.invoke('action-result', { id: 'abc', success: true });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('action-result', {
      id: 'abc',
      success: true,
    });
  });

  test('api.reportActionResult(id, true) calls ipcRenderer.invoke("action-result")', () => {
    api.reportActionResult('xyz', true);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('action-result', {
      id: 'xyz',
      success: true,
      error: undefined,
    });
  });

  // --- New channels (unread-mail-count, client-nav, go-home) ---

  test('api.on("unread-mail-count", fn) calls ipcRenderer.on and returns cleanup', () => {
    const fn = jest.fn();
    const cleanup = api.on('unread-mail-count', fn);
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      'unread-mail-count',
      expect.any(Function),
    );
    expect(typeof cleanup).toBe('function');
  });

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

  test('api.invoke allows focused-view nav channels', () => {
    api.invoke('fetch-nav-data');
    api.invoke('navigate-to', '/profile');
    api.invoke('open-external', 'https://example.com');
    api.invoke('switch-character', 'id1');
    api.invoke('sign-out');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('fetch-nav-data');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('navigate-to', '/profile');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'open-external',
      'https://example.com',
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('switch-character', 'id1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('sign-out');
  });

  test('api.on allows nav-data-updated and toggle-focused-view', () => {
    const fn = jest.fn();
    api.on('nav-data-updated', fn);
    api.on('toggle-focused-view', fn);
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      'nav-data-updated',
      expect.any(Function),
    );
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      'toggle-focused-view',
      expect.any(Function),
    );
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
