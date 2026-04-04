'use strict';

const CacheManager = require('../../src/cache');
const ActionQueue = require('../../src/action-queue');

describe('ActionQueue', () => {
  let cache;
  let queue;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new CacheManager();
    queue = new ActionQueue(cache);
  });

  afterEach(() => {
    queue.destroy();
    jest.useRealTimers();
  });

  // ── add ──

  test('add persists an action via CacheManager and returns queue length', () => {
    const len = queue.add({ type: 'vote', billId: 7 });
    expect(len).toBe(1);
    expect(cache.getQueuedActions()).toHaveLength(1);
    expect(cache.getQueuedActions()[0].type).toBe('vote');
  });

  test('add stamps the action with attempts: 0 and status: "queued"', () => {
    queue.add({ type: 'fundraise' });
    const [action] = cache.getQueuedActions();
    expect(action.attempts).toBe(0);
    expect(action.status).toBe('queued');
  });

  // ── getPending ──

  test('getPending returns queued and retrying actions', () => {
    queue.add({ type: 'a' });
    queue.add({ type: 'b' });
    const [a] = cache.getQueuedActions();
    cache.updateActionStatus(a.id, 'retrying');

    const pending = queue.getPending();
    expect(pending).toHaveLength(2);
  });

  test('getPending excludes completed actions', () => {
    queue.add({ type: 'done' });
    const [action] = cache.getQueuedActions();
    cache.updateActionStatus(action.id, 'completed');

    expect(queue.getPending()).toHaveLength(0);
  });

  test('getPending excludes permanently failed actions', () => {
    queue.add({ type: 'bad' });
    const [action] = cache.getQueuedActions();
    cache.updateActionStatus(action.id, 'failed');

    expect(queue.getPending()).toHaveLength(0);
  });

  // ── flush ──

  test('flush calls sendToRenderer with pending actions', () => {
    queue.add({ type: 'campaign' });
    const send = jest.fn();
    queue.flush(send);
    expect(send).toHaveBeenCalledWith(
      'flush-queue',
      expect.arrayContaining([expect.objectContaining({ type: 'campaign' })]),
    );
  });

  test('flush marks each pending action as "retrying"', () => {
    queue.add({ type: 'poll' });
    queue.flush(jest.fn());
    const [action] = cache.getQueuedActions();
    expect(action.status).toBe('retrying');
  });

  test('flush is a no-op when there are no pending actions', () => {
    const send = jest.fn();
    queue.flush(send);
    expect(send).not.toHaveBeenCalled();
  });

  test('flush does not send completed or failed actions', () => {
    queue.add({ type: 'done' });
    queue.add({ type: 'bad' });
    const actions = cache.getQueuedActions();
    cache.updateActionStatus(actions[0].id, 'completed');
    cache.updateActionStatus(actions[1].id, 'failed');

    const send = jest.fn();
    queue.flush(send);
    expect(send).not.toHaveBeenCalled();
  });

  // ── reportResult: success ──

  test('reportResult(success=true) removes the action from the queue', () => {
    queue.add({ type: 'advertise' });
    const [action] = cache.getQueuedActions();

    queue.reportResult(action.id, true);
    expect(cache.getQueuedActions()).toHaveLength(0);
  });

  test('reportResult(success=true) marks the action completed before removing', () => {
    queue.add({ type: 'build' });
    const [action] = cache.getQueuedActions();

    // Spy on updateActionStatus to confirm the completed transition
    const spy = jest.spyOn(cache, 'updateActionStatus');
    queue.reportResult(action.id, true);
    expect(spy).toHaveBeenCalledWith(action.id, 'completed');
  });

  // ── reportResult: failure within retries ──

  test('reportResult(success=false) resets action to "queued" when retries remain', () => {
    queue = new ActionQueue(cache, { maxRetries: 3 });
    queue.add({ type: 'donate' });
    const [action] = cache.getQueuedActions();

    queue.reportResult(action.id, false, 'timeout');
    const [updated] = cache.getQueuedActions();
    expect(updated.status).toBe('queued');
  });

  test('reportResult schedules a retry-ready event after retryDelay', () => {
    queue = new ActionQueue(cache, { maxRetries: 3, retryDelay: 1000 });
    queue.add({ type: 'x' });
    const [action] = cache.getQueuedActions();

    const retryListener = jest.fn();
    queue.on('retry-ready', retryListener);

    queue.reportResult(action.id, false, 'err');
    expect(retryListener).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(retryListener).toHaveBeenCalledTimes(1);
  });

  test('multiple failures share a single retry timer (not stacked)', () => {
    queue = new ActionQueue(cache, { maxRetries: 5, retryDelay: 2000 });
    queue.add({ type: 'a' });
    queue.add({ type: 'b' });
    const [a, b] = cache.getQueuedActions();

    const retryListener = jest.fn();
    queue.on('retry-ready', retryListener);

    queue.reportResult(a.id, false);
    queue.reportResult(b.id, false);

    jest.advanceTimersByTime(2000);
    expect(retryListener).toHaveBeenCalledTimes(1);
  });

  // ── reportResult: failure at max retries ──

  test('reportResult(success=false) marks action "failed" when maxRetries reached', () => {
    queue = new ActionQueue(cache, { maxRetries: 1 });
    queue.add({ type: 'risky' });
    const [action] = cache.getQueuedActions();

    // Exhaust retries (attempts starts at 0, fails at >= maxRetries=1)
    cache.updateActionStatus(action.id, 'retrying'); // attempts → 1
    queue.reportResult(action.id, false, 'server error');

    const [updated] = cache.getQueuedActions();
    expect(updated.status).toBe('failed');
  });

  test('emits action-failed event when an action is permanently failed', () => {
    queue = new ActionQueue(cache, { maxRetries: 1 });
    queue.add({ type: 'risky' });
    const [action] = cache.getQueuedActions();
    cache.updateActionStatus(action.id, 'retrying'); // attempts → 1

    const failListener = jest.fn();
    queue.on('action-failed', failListener);

    queue.reportResult(action.id, false, 'fatal error');
    expect(failListener).toHaveBeenCalledWith(
      expect.objectContaining({ id: action.id, lastError: 'fatal error' }),
    );
  });

  // ── reportResult: unknown ID ──

  test('reportResult is a no-op for an unknown action ID', () => {
    queue.add({ type: 'safe' });
    expect(() => queue.reportResult('ghost-id', false)).not.toThrow();
    // Original action untouched
    const [action] = cache.getQueuedActions();
    expect(action.status).toBe('queued');
  });

  // ── destroy ──

  test('destroy cancels the retry timer', () => {
    queue = new ActionQueue(cache, { retryDelay: 5000 });
    queue.add({ type: 'x' });
    const [action] = cache.getQueuedActions();
    queue.reportResult(action.id, false); // schedules retry

    const retryListener = jest.fn();
    queue.on('retry-ready', retryListener);
    queue.destroy();

    jest.advanceTimersByTime(5000);
    expect(retryListener).not.toHaveBeenCalled();
  });
});
