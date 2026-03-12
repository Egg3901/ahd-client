const { contextBridge, ipcRenderer } = require('electron');

/**
 * Minimal IPC bridge for the PiP dashboard window.
 * Exposes only the two actions the widget needs: open the main window
 * and request a resize when the user toggles expanded mode.
 */
contextBridge.exposeInMainWorld('pipBridge', {
  openMain: () => ipcRenderer.send('pip-open-main'),
  setExpanded: (expanded) => ipcRenderer.send('pip-set-expanded', expanded),
});
