'use strict';

/**
 * Integration test: SSEClient -> CacheManager + TrayManager + PipManager
 *
 * Uses real instances of all modules wired together the same way main.js
 * handleGameStateEvent does. Electron APIs are mocked via tests/__mocks__/electron.js.
 */

const { BrowserWindow } = require('electron');
const SSEClient = require('../../src/sse');
const CacheManager = require('../../src/cache');
const TrayManager = require('../../src/tray');
const PipManager = require('../../src/pip');

describe('SSE -> CacheManager + TrayManager + PipManager integration', () => {
  let sse;
  let cache;
  let tray;
  let pip;
  let mockWindow;

  beforeEach(() => {
    jest.useFakeTimers();

    // Create real instances
    sse = new SSEClient();
    mockWindow = new BrowserWindow();
    mockWindow.isDestroyed.mockReturnValue(false);
    mockWindow.isFocused.mockReturnValue(false);

    cache = new CacheManager();
    tray = new TrayManager(mockWindow, null);
    pip = new PipManager(mockWindow);

    // tray.create() must be called before updateGameState
    tray.create();

    // Wire SSEClient -> CacheManager + TrayManager + PipManager
    // (same flow as main.js handleGameStateEvent)
    sse.on('event', (event) => {
      const data = event.data || {};
      const fields = ['turnsUntilElection', 'actionPoints', 'currentDate', 'nextTurnIn'];
      const gameState = {};
      for (const field of fields) {
        if (data[field] !== undefined) gameState[field] = data[field];
      }
      if (Object.keys(gameState).length > 0) {
        tray.updateGameState(gameState);
        pip.updateGameState(gameState);
        cache.updateGameState(gameState);
      }
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('SSE data event updates cache, tray, and pip with game state fields', () => {
    sse.buffer =
      'event: game_state\ndata: {"turnsUntilElection":5,"actionPoints":3,"currentDate":"Jan 2026"}\n\n';
    sse.processBuffer();

    expect(cache.getGameState().turnsUntilElection).toBe(5);
    expect(tray.gameState.turnsUntilElection).toBe(5);
    expect(pip.gameState.currentDate).toBe('Jan 2026');
  });

  test('two partial SSE events are merged in cache — both fields present', () => {
    sse.buffer = 'event: game_state\ndata: {"turnsUntilElection":5}\n\n';
    sse.processBuffer();

    sse.buffer = 'event: game_state\ndata: {"actionPoints":3}\n\n';
    sse.processBuffer();

    const state = cache.getGameState();
    expect(state.turnsUntilElection).toBe(5);
    expect(state.actionPoints).toBe(3);
  });
});
