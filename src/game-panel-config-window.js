'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');

/** @type {Electron.BrowserWindow|null} */
let configWindow = null;

/**
 * @param {{ parent: Electron.BrowserWindow|null }} opts
 */
function openGamePanelConfigWindow(opts) {
  const parent = opts.parent;
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.focus();
    return;
  }

  configWindow = new BrowserWindow({
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: Boolean(parent && !parent.isDestroyed()),
    width: 440,
    height: 560,
    minWidth: 360,
    minHeight: 400,
    show: false,
    title: 'Game panel shortcuts',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'game-panel-config-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  configWindow.loadFile(path.join(__dirname, 'game-panel-config.html'));
  configWindow.once('ready-to-show', () => {
    if (configWindow && !configWindow.isDestroyed()) configWindow.show();
  });
  configWindow.on('closed', () => {
    configWindow = null;
  });
}

function closeGamePanelConfigWindow() {
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.close();
  }
}

module.exports = {
  openGamePanelConfigWindow,
  closeGamePanelConfigWindow,
};
