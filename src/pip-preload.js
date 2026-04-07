const { contextBridge, ipcRenderer } = require('electron');

/**
 * IPC bridge for the PiP dashboard window (themed views + bar).
 */
contextBridge.exposeInMainWorld('pipBridge', {
  openMain: () => ipcRenderer.send('pip-open-main'),
  /** Load a path on the main game window (e.g. /elections/abc). PiP stays open. */
  navigateTo: (path) => ipcRenderer.send('pip-navigate', path),
  cycleView: () => ipcRenderer.invoke('pip-cycle-view'),
  openGamePanelConfig: () => ipcRenderer.invoke('open-game-panel-config'),
  saveCustomPanels: (panels) =>
    ipcRenderer.invoke('pip-set-custom-panels', panels),
});
