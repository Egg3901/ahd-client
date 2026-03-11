const { contextBridge, ipcRenderer } = require('electron');

const INVOKE_CHANNELS = [
  'dev-get-state',
  'dev-get-config',
  'dev-switch-server',
  'dev-reconnect-sse',
  'dev-clear-cache',
];

const RECEIVE_CHANNELS = ['dev-sse-event', 'dev-ipc-call'];

contextBridge.exposeInMainWorld('devTools', {
  getState: () => ipcRenderer.invoke('dev-get-state'),
  getConfig: () => ipcRenderer.invoke('dev-get-config'),
  switchServer: (url) => ipcRenderer.invoke('dev-switch-server', url),
  reconnectSse: () => ipcRenderer.invoke('dev-reconnect-sse'),
  clearCache: () => ipcRenderer.invoke('dev-clear-cache'),

  on: (channel, callback) => {
    if (!RECEIVE_CHANNELS.includes(channel)) return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
