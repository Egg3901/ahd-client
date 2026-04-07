const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gamePanelConfig', {
  getConfig: () => ipcRenderer.invoke('get-game-panel-config'),
  save: (payload) => ipcRenderer.invoke('set-game-panel-entries', payload),
  reset: () => ipcRenderer.invoke('reset-game-panel-entries'),
});
