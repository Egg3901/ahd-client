'use strict';

/**
 * Integration tests for the client-nav hydration pipeline added in the
 * alignment plan:
 *
 *   handleClientNav  →  handleGameStateEvent  →  CacheManager / TrayManager
 *
 * We replicate the exact logic from main.js so these tests act as a
 * living specification of the hydration contract.
 */

const { BrowserWindow } = require('electron');
const CacheManager = require('../../src/cache');
const TrayManager = require('../../src/tray');

// --- Helpers replicating main.js logic ---

/**
 * Mirrors main.js handleGameStateEvent: extract known fields and merge into
 * cache + tray.
 */
function handleGameStateEvent(event, { cache, tray }) {
  const data = event.data || {};
  const fields = [
    'turnsUntilElection',
    'actionPoints',
    'maxActionPoints',
    'currentDate',
    'nextTurnIn',
    'funds',
    'cashOnHand',
    'projectedIncome',
    'incomeBreakdown',
    'unreadMailCount',
    'politicalInfluence',
    'favorability',
    'infamy',
    'electionDate',
    'electionName',
    'actionCosts',
  ];
  const gameState = {};
  for (const field of fields) {
    if (data[field] !== undefined) gameState[field] = data[field];
  }
  if (Object.keys(gameState).length > 0) {
    tray.updateGameState(gameState);
    cache.updateGameState(gameState);
  }
}

/**
 * Mirrors main.js handleClientNav hydration block: extract financial fields
 * from the manifest and feed into handleGameStateEvent.
 */
function handleClientNav(manifest, deps) {
  if (!manifest) return;
  const navState = {};
  if (manifest.funds != null) navState.funds = manifest.funds;
  if (manifest.actions != null) navState.actionPoints = manifest.actions;
  if (manifest.cashOnHand != null) navState.cashOnHand = manifest.cashOnHand;
  if (manifest.projectedIncome != null)
    navState.projectedIncome = manifest.projectedIncome;
  if (manifest.unreadMailCount != null)
    navState.unreadMailCount = manifest.unreadMailCount;
  if (Object.keys(navState).length > 0) {
    handleGameStateEvent({ data: navState }, deps);
  }
}

// --- Test suite ---

describe('client-nav → game state hydration', () => {
  let cache;
  let tray;
  let deps;

  beforeEach(() => {
    const mockWindow = new BrowserWindow();
    mockWindow.isDestroyed.mockReturnValue(false);
    mockWindow.isFocused.mockReturnValue(false);

    cache = new CacheManager();
    tray = new TrayManager(mockWindow, null);
    tray.create();

    deps = { cache, tray };
  });

  test('funds from client-nav is stored in cache', () => {
    handleClientNav({ funds: 500000 }, deps);
    expect(cache.getGameState().funds).toBe(500000);
  });

  test('actions from client-nav maps to actionPoints in cache', () => {
    handleClientNav({ actions: 7 }, deps);
    expect(cache.getGameState().actionPoints).toBe(7);
  });

  test('cashOnHand from client-nav is stored in cache', () => {
    handleClientNav({ cashOnHand: 125000 }, deps);
    expect(cache.getGameState().cashOnHand).toBe(125000);
  });

  test('projectedIncome from client-nav is stored in cache', () => {
    handleClientNav({ projectedIncome: 80000 }, deps);
    expect(cache.getGameState().projectedIncome).toBe(80000);
  });

  test('unreadMailCount from client-nav is stored in cache', () => {
    handleClientNav({ unreadMailCount: 4 }, deps);
    expect(cache.getGameState().unreadMailCount).toBe(4);
  });

  test('all financial fields are hydrated in a single manifest', () => {
    handleClientNav(
      {
        funds: 300000,
        actions: 5,
        cashOnHand: 50000,
        projectedIncome: 60000,
        unreadMailCount: 2,
      },
      deps,
    );
    const state = cache.getGameState();
    expect(state.funds).toBe(300000);
    expect(state.actionPoints).toBe(5);
    expect(state.cashOnHand).toBe(50000);
    expect(state.projectedIncome).toBe(60000);
    expect(state.unreadMailCount).toBe(2);
  });

  test('null fields in manifest do not overwrite existing cached values', () => {
    cache.updateGameState({ funds: 999 });
    // manifest has funds: null — should not hydrate
    handleClientNav({ funds: null, actions: 3 }, deps);
    expect(cache.getGameState().funds).toBe(999);
    expect(cache.getGameState().actionPoints).toBe(3);
  });

  test('undefined fields in manifest are ignored', () => {
    cache.updateGameState({ cashOnHand: 777 });
    // manifest omits cashOnHand entirely
    handleClientNav({ funds: 100 }, deps);
    expect(cache.getGameState().cashOnHand).toBe(777);
  });

  test('null manifest is a no-op', () => {
    cache.updateGameState({ funds: 12345 });
    handleClientNav(null, deps);
    expect(cache.getGameState().funds).toBe(12345);
  });

  test('financial fields are propagated to TrayManager', () => {
    handleClientNav({ funds: 400000, actions: 6 }, deps);
    expect(tray.gameState.funds).toBe(400000);
    expect(tray.gameState.actionPoints).toBe(6);
  });

  test('unreadMailCount: 0 is hydrated (falsy but not null)', () => {
    cache.updateGameState({ unreadMailCount: 5 });
    handleClientNav({ unreadMailCount: 0 }, deps);
    expect(cache.getGameState().unreadMailCount).toBe(0);
  });
});

// --- SSE theme_changed hydration ---

describe('SSE theme_changed → syncNativeTheme integration', () => {
  const { nativeTheme } = require('electron');
  const CacheManagerLocal = require('../../src/cache');

  // Replicates the main.js sseClient.on('theme_changed', ...) handler
  function handleThemeChanged(data, { cache, syncNativeTheme }) {
    const theme = data?.payload?.theme ?? data?.theme;
    if (theme && cache && theme !== cache.getTheme()) {
      cache.setTheme(theme);
      syncNativeTheme(theme);
    }
  }

  function syncNativeTheme(themeId) {
    const lightThemes = ['light', 'pastel', 'usa'];
    nativeTheme.themeSource = lightThemes.includes(themeId) ? 'light' : 'dark';
  }

  let cache;

  beforeEach(() => {
    cache = new CacheManagerLocal();
    nativeTheme.themeSource = 'system';
  });

  test('theme_changed with payload.theme updates cache and nativeTheme', () => {
    handleThemeChanged(
      { payload: { theme: 'light' }, userId: 'u1' },
      { cache, syncNativeTheme },
    );
    expect(cache.getTheme()).toBe('light');
    expect(nativeTheme.themeSource).toBe('light');
  });

  test('theme_changed with top-level theme field (legacy shape) updates cache', () => {
    handleThemeChanged({ theme: 'oled' }, { cache, syncNativeTheme });
    expect(cache.getTheme()).toBe('oled');
    expect(nativeTheme.themeSource).toBe('dark');
  });

  test('theme_changed is a no-op when theme is the same as cached', () => {
    cache.setTheme('dark-pastel');
    nativeTheme.themeSource = 'system'; // reset to detect any write
    handleThemeChanged(
      { payload: { theme: 'dark-pastel' } },
      { cache, syncNativeTheme },
    );
    // nativeTheme should NOT have been updated since theme didn't change
    expect(nativeTheme.themeSource).toBe('system');
  });

  test('theme_changed with no theme field is a no-op', () => {
    cache.setTheme('default');
    handleThemeChanged({}, { cache, syncNativeTheme });
    expect(cache.getTheme()).toBe('default');
  });
});
