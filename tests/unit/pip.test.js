'use strict';

const { BrowserWindow } = require('electron');
const PipManager = require('../../src/pip');

function makeMockWindow() {
  return {
    show: jest.fn(),
    focus: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  BrowserWindow._reset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PipManager', () => {
  describe('isOpen()', () => {
    it('returns falsy initially', () => {
      const pip = new PipManager(makeMockWindow());
      expect(pip.isOpen()).toBeFalsy();
    });
  });

  describe('toggle()', () => {
    it('opens when closed (pipWindow not null)', () => {
      const pip = new PipManager(makeMockWindow());
      pip.toggle();
      expect(pip.pipWindow).not.toBeNull();
    });

    it('closes when open (pipWindow null)', () => {
      const pip = new PipManager(makeMockWindow());
      pip.open();
      expect(pip.pipWindow).not.toBeNull();
      pip.toggle();
      expect(pip.pipWindow).toBeNull();
    });
  });

  describe('open()', () => {
    it('creates BrowserWindow with alwaysOnTop=true and frame=false', () => {
      const pip = new PipManager(makeMockWindow());
      pip.open();
      expect(pip.pipWindow).toBeInstanceOf(BrowserWindow);
      expect(pip.pipWindow._options.alwaysOnTop).toBe(true);
      expect(pip.pipWindow._options.frame).toBe(false);
    });

    it('focuses existing window on second call (does not create new)', () => {
      const pip = new PipManager(makeMockWindow());
      pip.open();
      const firstWindow = pip.pipWindow;
      BrowserWindow.prototype.focus.mockClear();
      pip.open();
      expect(pip.pipWindow).toBe(firstWindow);
      expect(BrowserWindow.prototype.focus).toHaveBeenCalledTimes(1);
    });
  });

  describe('close()', () => {
    it('sets pipWindow to null', () => {
      const pip = new PipManager(makeMockWindow());
      pip.open();
      expect(pip.pipWindow).not.toBeNull();
      pip.close();
      expect(pip.pipWindow).toBeNull();
    });

    it('clears updateInterval', () => {
      const pip = new PipManager(makeMockWindow());
      pip.open();
      expect(pip.updateInterval).not.toBeNull();
      pip.close();
      expect(pip.updateInterval).toBeNull();
    });
  });

  describe('updateBarState()', () => {
    it('merges state fields — only provided fields change', () => {
      const pip = new PipManager(makeMockWindow());
      pip.barState = {
        currentDate: '1861-01-01',
        nextTurnIn: '2h',
        actionPoints: 5,
      };

      pip.updateBarState({ currentDate: '1862-06-01' });

      expect(pip.barState.currentDate).toBe('1862-06-01');
      expect(pip.barState.nextTurnIn).toBe('2h');
      expect(pip.barState.actionPoints).toBe(5);
    });

    it('merges multiple fields at once', () => {
      const pip = new PipManager(makeMockWindow());
      pip.updateBarState({
        currentDate: '1863-03-01',
        nextTurnIn: '5h',
        actionPoints: 10,
      });
      expect(pip.barState.currentDate).toBe('1863-03-01');
      expect(pip.barState.nextTurnIn).toBe('5h');
      expect(pip.barState.actionPoints).toBe(10);
    });
  });

  describe('startUpdates()', () => {
    it('creates interval — after 10000ms, updateDisplay is called', () => {
      const pip = new PipManager(makeMockWindow());
      pip.open();
      // After open() pipWindow exists, make updateDisplay spyable
      const updateDisplaySpy = jest.spyOn(pip, 'updateDisplay');

      jest.advanceTimersByTime(10000);

      expect(updateDisplaySpy).toHaveBeenCalled();
    });
  });

  describe('expandToFull()', () => {
    it('shows and focuses mainWindow and closes PiP', () => {
      const mainWindow = makeMockWindow();
      const pip = new PipManager(mainWindow);
      pip.open();
      expect(pip.pipWindow).not.toBeNull();

      pip.expandToFull();

      expect(mainWindow.show).toHaveBeenCalled();
      expect(mainWindow.focus).toHaveBeenCalled();
      expect(pip.pipWindow).toBeNull();
    });
  });

  describe('destroy()', () => {
    it('closes PiP and stops updates', () => {
      const pip = new PipManager(makeMockWindow());
      pip.open();
      expect(pip.pipWindow).not.toBeNull();
      expect(pip.updateInterval).not.toBeNull();

      pip.destroy();

      expect(pip.pipWindow).toBeNull();
      expect(pip.updateInterval).toBeNull();
    });
  });

  describe('setWindow()', () => {
    it('updates mainWindow reference', () => {
      const win1 = makeMockWindow();
      const win2 = makeMockWindow();
      const pip = new PipManager(win1);
      expect(pip.mainWindow).toBe(win1);
      pip.setWindow(win2);
      expect(pip.mainWindow).toBe(win2);
    });
  });
});
