const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal API to the renderer process
contextBridge.exposeInMainWorld('ahdClient', {
  platform: process.platform,
  isElectron: true,
});
