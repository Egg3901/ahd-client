const EventEmitter = require('events');

class MockAutoUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = true;
    this.autoInstallOnAppQuit = true;
  }
}

MockAutoUpdater.prototype.checkForUpdates = jest.fn();
MockAutoUpdater.prototype.downloadUpdate = jest.fn();
MockAutoUpdater.prototype.quitAndInstall = jest.fn();

const autoUpdater = new MockAutoUpdater();

module.exports = { autoUpdater };
