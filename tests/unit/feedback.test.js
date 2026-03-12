'use strict';

const FeedbackManager = require('../../src/feedback');

function makeMockWindow() {
  return {
    isDestroyed: jest.fn().mockReturnValue(false),
    webContents: {
      capturePage: jest.fn().mockResolvedValue({
        toPNG: jest.fn().mockReturnValue(Buffer.from('fake-png')),
      }),
      send: jest.fn(),
      executeJavaScript: jest.fn().mockResolvedValue(undefined),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FeedbackManager', () => {
  describe('getSystemInfo()', () => {
    it('returns an object with the required keys', () => {
      const fm = new FeedbackManager(makeMockWindow());
      const info = fm.getSystemInfo();
      const expectedKeys = [
        'platform',
        'arch',
        'osVersion',
        'electronVersion',
        'chromeVersion',
        'nodeVersion',
        'appVersion',
        'totalMemory',
        'freeMemory',
        'cpus',
      ];
      expectedKeys.forEach((key) => {
        expect(info).toHaveProperty(key);
      });
    });

    it('returns appVersion from package.json', () => {
      const fm = new FeedbackManager(makeMockWindow());
      const info = fm.getSystemInfo();
      expect(info.appVersion).toBe(require('../../package.json').version);
    });
  });

  describe('captureScreenshot()', () => {
    it('returns a Buffer when mainWindow.webContents.capturePage resolves', async () => {
      const mainWindow = makeMockWindow();
      const fm = new FeedbackManager(mainWindow);
      const result = await fm.captureScreenshot();
      expect(result).toBeInstanceOf(Buffer);
    });

    it('returns null when mainWindow is destroyed', async () => {
      const mainWindow = makeMockWindow();
      mainWindow.isDestroyed.mockReturnValue(true);
      const fm = new FeedbackManager(mainWindow);
      const result = await fm.captureScreenshot();
      expect(result).toBeNull();
    });

    it('returns null when capturePage throws', async () => {
      const mainWindow = makeMockWindow();
      mainWindow.webContents.capturePage.mockRejectedValue(
        new Error('capture failed'),
      );
      const fm = new FeedbackManager(mainWindow);
      const result = await fm.captureScreenshot();
      expect(result).toBeNull();
    });
  });
});
