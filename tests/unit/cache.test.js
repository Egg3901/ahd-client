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

  // --- Action queue: status tracking (new fields) ---

  test('queueAction stamps new actions with attempts: 0 and status: "queued"', () => {
    cache.queueAction({ type: 'vote', billId: 1 });
    const [action] = cache.getQueuedActions();
    expect(action.attempts).toBe(0);
    expect(action.status).toBe('queued');
  });

  test('updateActionStatus sets status on the matching action', () => {
    cache.queueAction({ type: 'campaign' });
    const [action] = cache.getQueuedActions();

    cache.updateActionStatus(action.id, 'retrying');
    const [updated] = cache.getQueuedActions();
    expect(updated.status).toBe('retrying');
  });

  test('updateActionStatus increments attempts on "retrying"', () => {
    cache.queueAction({ type: 'fundraise' });
    const [action] = cache.getQueuedActions();

    cache.updateActionStatus(action.id, 'retrying');
    cache.updateActionStatus(action.id, 'retrying');
    const [updated] = cache.getQueuedActions();
    expect(updated.attempts).toBe(2);
  });

  test('updateActionStatus increments attempts on "failed"', () => {
    cache.queueAction({ type: 'advertise' });
    const [action] = cache.getQueuedActions();

    cache.updateActionStatus(action.id, 'failed', 'timeout');
    const [updated] = cache.getQueuedActions();
    expect(updated.attempts).toBe(1);
  });

  test('updateActionStatus does not increment attempts on "completed"', () => {
    cache.queueAction({ type: 'poll' });
    const [action] = cache.getQueuedActions();

    cache.updateActionStatus(action.id, 'completed');
    const [updated] = cache.getQueuedActions();
    expect(updated.attempts).toBe(0);
  });

  test('updateActionStatus sets completedAt timestamp on "completed"', () => {
    const before = Date.now();
    cache.queueAction({ type: 'build' });
    const [action] = cache.getQueuedActions();

    cache.updateActionStatus(action.id, 'completed');
    const after = Date.now();

    const [updated] = cache.getQueuedActions();
    expect(typeof updated.completedAt).toBe('number');
    expect(updated.completedAt).toBeGreaterThanOrEqual(before);
    expect(updated.completedAt).toBeLessThanOrEqual(after);
  });

  test('updateActionStatus records lastError when provided', () => {
    cache.queueAction({ type: 'donate' });
    const [action] = cache.getQueuedActions();

    cache.updateActionStatus(action.id, 'failed', 'Server returned 500');
    const [updated] = cache.getQueuedActions();
    expect(updated.lastError).toBe('Server returned 500');
  });

  test('updateActionStatus is a no-op for an unknown action ID', () => {
    cache.queueAction({ type: 'noop' });
    // Should not throw
    expect(() =>
      cache.updateActionStatus('nonexistent-id', 'completed'),
    ).not.toThrow();
    // Original action is untouched
    const [action] = cache.getQueuedActions();
    expect(action.status).toBe('queued');
  });

  // --- Game state schema: new fields ---

  test('gameState default includes cashOnHand as null', () => {
    const state = cache.getGameState();
    expect(Object.prototype.hasOwnProperty.call(state, 'cashOnHand')).toBe(
      true,
    );
    expect(state.cashOnHand).toBeNull();
  });

  test('gameState default includes unreadMailCount as null', () => {
    const state = cache.getGameState();
    expect(Object.prototype.hasOwnProperty.call(state, 'unreadMailCount')).toBe(
      true,
    );
    expect(state.unreadMailCount).toBeNull();
  });

  test('updateGameState can set and persist cashOnHand', () => {
    cache.updateGameState({ cashOnHand: 250000 });
    expect(cache.getGameState().cashOnHand).toBe(250000);
  });

  test('updateGameState can set and persist unreadMailCount', () => {
    cache.updateGameState({ unreadMailCount: 3 });
    expect(cache.getGameState().unreadMailCount).toBe(3);
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
