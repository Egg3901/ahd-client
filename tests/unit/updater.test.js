const { autoUpdater } = require('electron-updater');
const { BrowserWindow } = require('electron');
const UpdateManager = require('../../src/updater');

describe('UpdateManager', () => {
  let mainWindow;
  let manager;

  beforeEach(() => {
    // Remove listeners registered by any previous UpdateManager instance
    autoUpdater.removeAllListeners();

    mainWindow = new BrowserWindow();
    manager = new UpdateManager(mainWindow);
  });

  // --- Constructor ---

  test('constructor sets autoUpdater.autoDownload = false', () => {
    expect(autoUpdater.autoDownload).toBe(false);
  });

  test('constructor sets autoUpdater.autoInstallOnAppQuit = true', () => {
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  // --- checkForUpdates ---

  test('checkForUpdates() calls autoUpdater.checkForUpdates', () => {
    manager.checkForUpdates();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  // --- Event: checking-for-update ---

  test("'checking-for-update' event sends 'Checking for updates...' status", () => {
    autoUpdater.emit('checking-for-update');
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'update-status',
      'Checking for updates...'
    );
  });

  // --- Event: update-not-available ---

  test("'update-not-available' event sends 'Up to date.' status", () => {
    autoUpdater.emit('update-not-available');
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'update-status',
      'Up to date.'
    );
  });

  // --- Event: download-progress ---

  test("'download-progress' event calls mainWindow.setProgressBar(0.5) for 50%", () => {
    autoUpdater.emit('download-progress', { percent: 50 });
    expect(mainWindow.setProgressBar).toHaveBeenCalledWith(0.5);
  });

  test("'download-progress' event sends 'Downloading update: 50%' status", () => {
    autoUpdater.emit('download-progress', { percent: 50 });
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'update-status',
      'Downloading update: 50%'
    );
  });

  // --- Event: error ---

  test("'error' event sends 'Update check failed.' status", () => {
    autoUpdater.emit('error', new Error('network error'));
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'update-status',
      'Update check failed.'
    );
  });

  // --- No-op when window is destroyed ---

  test('events do not throw when mainWindow is destroyed', () => {
    mainWindow._destroyed = true;

    expect(() => {
      autoUpdater.emit('checking-for-update');
      autoUpdater.emit('update-not-available');
      autoUpdater.emit('download-progress', { percent: 25 });
      autoUpdater.emit('error', new Error('fail'));
    }).not.toThrow();
  });

  test('webContents.send is not called when mainWindow is destroyed', () => {
    mainWindow._destroyed = true;
    autoUpdater.emit('checking-for-update');
    expect(mainWindow.webContents.send).not.toHaveBeenCalled();
  });

  // --- setWindow ---

  test('setWindow updates the mainWindow reference', () => {
    const newWindow = new BrowserWindow();
    manager.setWindow(newWindow);
    expect(manager.mainWindow).toBe(newWindow);
  });

  test('setWindow causes subsequent events to target the new window', () => {
    const newWindow = new BrowserWindow();
    manager.setWindow(newWindow);

    autoUpdater.emit('update-not-available');

    expect(newWindow.webContents.send).toHaveBeenCalledWith(
      'update-status',
      'Up to date.'
    );
    expect(mainWindow.webContents.send).not.toHaveBeenCalled();
  });
});
