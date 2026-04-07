const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gamePanelConfig', {
  getConfig: () => ipcRenderer.invoke('get-game-panel-config'),
  save: (payload) => ipcRenderer.invoke('set-game-panel-entries', payload),
  reset: () => ipcRenderer.invoke('reset-game-panel-entries'),
  getPipBarConfig: () => ipcRenderer.invoke('get-pip-bar-config'),
  setPipBarConfig: (stats) => ipcRenderer.invoke('set-pip-bar-config', stats),
  resetPipBarStats: () => ipcRenderer.invoke('reset-pip-bar-stats'),
  getCustomShortcuts: () => ipcRenderer.invoke('get-custom-shortcuts'),
  saveShortcuts: (overrides) => ipcRenderer.invoke('save-shortcuts', overrides),
});
