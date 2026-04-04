const { contextBridge, ipcRenderer } = require('electron');

// Channels the renderer is allowed to receive on
const RECEIVE_CHANNELS = [
  'sse-status',
  'flush-queue',
  'open-feedback',
  'update-status',
  'route-changed',
  'nav-state',
  'loading-state',
  'auth-state',
  'unread-count',
  'unread-mail-count',
  'client-nav',
  'queue-status',
  'queue-action-failed',
];

// Channels the renderer is allowed to invoke (request/response)
const INVOKE_CHANNELS = [
  'get-game-state',
  'get-cached-turn',
  'queue-action',
  'get-queue',
  'get-theme',
  'set-theme',
  'get-preferences',
  'set-preference',
  'update-game-state',
  'open-window',
  'toggle-pip',
  'capture-screenshot',
  'get-system-info',
  'check-updates',
  'get-sse-status',
  'set-admin',
  'theme-changed-on-site',
  'go-back',
  'go-forward',
  'set-zoom',
  'get-zoom',
  'go-home',
  'complete-action',
  'fail-action',
  'clear-queue',
  'get-error-codes',
  'get-compatibility-status',
];

contextBridge.exposeInMainWorld('ahdClient', {
  platform: process.platform,
  isElectron: true,

  // --- IPC invoke (request/response) ---
  invoke: (channel, ...args) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Blocked channel: ${channel}`));
  },

  // --- IPC listeners (main -> renderer) ---
  on: (channel, callback) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
    return () => {};
  },

  once: (channel, callback) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.once(channel, (event, ...args) => callback(...args));
    }
  },

  // --- Convenience methods ---

  // Game state
  getGameState: () => ipcRenderer.invoke('get-game-state'),
  getCachedTurn: () => ipcRenderer.invoke('get-cached-turn'),
  updateGameState: (state) => ipcRenderer.invoke('update-game-state', state),

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (themeId) => ipcRenderer.invoke('set-theme', themeId),

  // Preferences
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  setPreference: (key, value) =>
    ipcRenderer.invoke('set-preference', { key, value }),

  // Action queue (offline support)
  queueAction: (action) => ipcRenderer.invoke('queue-action', action),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  completeAction: (actionId) => ipcRenderer.invoke('complete-action', actionId),
  failAction: (actionId, error) => ipcRenderer.invoke('fail-action', { actionId, error }),
  clearQueue: () => ipcRenderer.invoke('clear-queue'),

  // Error codes
  getErrorCodes: () => ipcRenderer.invoke('get-error-codes'),

  // API compatibility
  getCompatibilityStatus: () => ipcRenderer.invoke('get-compatibility-status'),

  // Multi-window
  openWindow: (preset) => ipcRenderer.invoke('open-window', preset),

  // PiP
  togglePip: () => ipcRenderer.invoke('toggle-pip'),

  // Feedback
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

  // Updates
  checkUpdates: () => ipcRenderer.invoke('check-updates'),

  // SSE status
  getSSEStatus: () => ipcRenderer.invoke('get-sse-status'),

  // Admin
  setAdmin: (isAdmin) => ipcRenderer.invoke('set-admin', isAdmin),

  // Navigation
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  goHome: () => ipcRenderer.invoke('go-home'),

  // Zoom
  setZoom: (factor) => ipcRenderer.invoke('set-zoom', factor),
  getZoom: () => ipcRenderer.invoke('get-zoom'),
});
