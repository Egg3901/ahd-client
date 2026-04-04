'use strict';

const CacheManager = require('../../src/cache');

describe('CacheManager', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheManager();
  });

  // --- Turn data caching ---

  test('cacheTurnData stores data with a cachedAt timestamp', () => {
    const before = Date.now();
    cache.cacheTurnData({ turn: 5, player: 'Alice' });
    const after = Date.now();

    const result = cache.getCachedTurnData();
    expect(result.turn).toBe(5);
    expect(result.player).toBe('Alice');
    expect(typeof result.cachedAt).toBe('number');
    expect(result.cachedAt).toBeGreaterThanOrEqual(before);
    expect(result.cachedAt).toBeLessThanOrEqual(after);
  });

  test('getCachedTurnData returns {} when nothing has been cached', () => {
    const result = cache.getCachedTurnData();
    expect(result).toEqual({});
  });

  // --- Action queuing ---

  test('queueAction adds an action with a unique ID and queuedAt timestamp', () => {
    const before = Date.now();
    cache.queueAction({ type: 'vote', billId: 42 });
    const after = Date.now();

    const actions = cache.getQueuedActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('vote');
    expect(actions[0].billId).toBe(42);
    expect(typeof actions[0].id).toBe('string');
    expect(actions[0].id.length).toBeGreaterThan(0);
    expect(typeof actions[0].queuedAt).toBe('number');
    expect(actions[0].queuedAt).toBeGreaterThanOrEqual(before);
    expect(actions[0].queuedAt).toBeLessThanOrEqual(after);
  });

  test('queueAction returns the new queue length', () => {
    const len1 = cache.queueAction({ type: 'a' });
    expect(len1).toBe(1);

    const len2 = cache.queueAction({ type: 'b' });
    expect(len2).toBe(2);
  });

  test('two queued actions have different IDs', () => {
    cache.queueAction({ type: 'a' });
    cache.queueAction({ type: 'b' });

    const actions = cache.getQueuedActions();
    expect(actions[0].id).not.toBe(actions[1].id);
  });

  test('clearQueue empties the queue', () => {
    cache.queueAction({ type: 'a' });
    cache.queueAction({ type: 'b' });
    expect(cache.getQueueLength()).toBe(2);

    cache.clearQueue();
    expect(cache.getQueueLength()).toBe(0);
    expect(cache.getQueuedActions()).toEqual([]);
  });

  test('removeFromQueue removes the action with the matching ID', () => {
    cache.queueAction({ type: 'a' });
    cache.queueAction({ type: 'b' });

    const actions = cache.getQueuedActions();
    const idToRemove = actions[0].id;

    cache.removeFromQueue(idToRemove);

    const remaining = cache.getQueuedActions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).not.toBe(idToRemove);
  });

  test('getQueueLength returns the correct count', () => {
    expect(cache.getQueueLength()).toBe(0);
    cache.queueAction({ type: 'a' });
    expect(cache.getQueueLength()).toBe(1);
    cache.queueAction({ type: 'b' });
    expect(cache.getQueueLength()).toBe(2);
  });

  // --- User preferences ---

  test('getTheme returns "default" initially', () => {
    expect(cache.getTheme()).toBe('default');
  });

  test('setTheme persists the theme value', () => {
    cache.setTheme('dark');
    expect(cache.getTheme()).toBe('dark');
  });

  test('getPreference / setPreference roundtrip', () => {
    expect(cache.getPreference('notificationsEnabled')).toBeUndefined();
    cache.setPreference('notificationsEnabled', false);
    expect(cache.getPreference('notificationsEnabled')).toBe(false);

    cache.setPreference('miniModeEnabled', true);
    expect(cache.getPreference('miniModeEnabled')).toBe(true);
  });

  // --- Game state ---

  test('updateGameState merges partial state into the existing game state', () => {
    cache.updateGameState({ turnsUntilElection: 3 });
    cache.updateGameState({ actionPoints: 5 });

    const state = cache.getGameState();
    expect(state.turnsUntilElection).toBe(3);
    expect(state.actionPoints).toBe(5);
  });

  test('getGameState returns an object', () => {
    const state = cache.getGameState();
    expect(state).toBeDefined();
    expect(typeof state).toBe('object');
  });

  test('updateGameState persists cashOnHand field', () => {
    cache.updateGameState({ cashOnHand: 250000 });
    expect(cache.getGameState().cashOnHand).toBe(250000);
  });

  // --- updateActionInQueue ---

  test('updateActionInQueue merges updates into the matching action', () => {
    cache.queueAction({ type: 'vote' });
    const id = cache.getQueuedActions()[0].id;

    cache.updateActionInQueue(id, { attempts: 2, lastError: 'timeout' });

    const updated = cache.getQueuedActions()[0];
    expect(updated.attempts).toBe(2);
    expect(updated.lastError).toBe('timeout');
    expect(updated.type).toBe('vote'); // original fields preserved
  });

  test('updateActionInQueue is a no-op for unknown action ID', () => {
    cache.queueAction({ type: 'vote' });
    expect(() =>
      cache.updateActionInQueue('nonexistent', { attempts: 1 }),
    ).not.toThrow();
    expect(cache.getQueuedActions()[0].attempts).toBeUndefined();
  });

  // --- General ---

  test('clear wipes all cached data', () => {
    cache.cacheTurnData({ turn: 1 });
    cache.queueAction({ type: 'a' });
    cache.setTheme('dark');
    cache.updateGameState({ actionPoints: 9 });

    cache.clear();

    expect(cache.getCachedTurnData()).toEqual({});
    expect(cache.getQueuedActions()).toEqual([]);
    // After clear the store's Map is empty; getTheme falls back to its literal default
    expect(cache.getTheme()).toBe('default');
  });
});
