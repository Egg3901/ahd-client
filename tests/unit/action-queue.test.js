'use strict';

const ActionQueue = require('../../src/action-queue');
const CacheManager = require('../../src/cache');

describe('ActionQueue', () => {
  let cache;
  let send;
  let queue;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new CacheManager();
    send = jest.fn();
    queue = new ActionQueue(cache, send);
  });

  afterEach(() => {
    queue.destroy();
    jest.useRealTimers();
  });

  // --- enqueue ---

  test('enqueue adds action to cache and returns queue length', () => {
    const len = queue.enqueue({ type: 'vote', billId: 1 });
    expect(len).toBe(1);
    expect(cache.getQueueLength()).toBe(1);
  });

  test('enqueue sends queue-status to renderer', () => {
    queue.enqueue({ type: 'vote' });
    expect(send).toHaveBeenCalledWith('queue-status', { queued: 1, processing: false });
  });

  // --- flush ---

  test('flush sends flush-queue with all queued actions', () => {
    cache.queueAction({ type: 'a' });
    cache.queueAction({ type: 'b' });
    queue.flush();
    const flushed = send.mock.calls.find(([ch]) => ch === 'flush-queue');
    expect(flushed).toBeDefined();
    expect(flushed[1]).toHaveLength(2);
  });

  test('flush sends queue-status with processing:true', () => {
    cache.queueAction({ type: 'a' });
    queue.flush();
    const statusCall = send.mock.calls.find(
      ([ch, d]) => ch === 'queue-status' && d.processing === true,
    );
    expect(statusCall).toBeDefined();
  });

  test('flush is a no-op when queue is empty', () => {
    queue.flush();
    expect(send).not.toHaveBeenCalledWith('flush-queue', expect.anything());
  });

  // --- complete ---

  test('complete removes the action from cache', () => {
    cache.queueAction({ type: 'a' });
    const id = cache.getQueuedActions()[0].id;
    queue.complete(id);
    expect(cache.getQueueLength()).toBe(0);
  });

  test('complete sets processing to false when queue empties', () => {
    cache.queueAction({ type: 'a' });
    queue._processing = true;
    const id = cache.getQueuedActions()[0].id;
    send.mockClear();
    queue.complete(id);
    const statusCall = send.mock.calls.find(([ch]) => ch === 'queue-status');
    expect(statusCall[1].processing).toBe(false);
  });

  // --- fail ---

  test('fail increments attempt count in cache', () => {
    cache.queueAction({ type: 'a' });
    const id = cache.getQueuedActions()[0].id;
    queue.fail(id, 'network error');
    const action = cache.getQueuedActions()[0];
    expect(action.attempts).toBe(1);
    expect(action.lastError).toBe('network error');
  });

  test('fail schedules a retry if attempts < MAX_ATTEMPTS', () => {
    cache.queueAction({ type: 'a' });
    const id = cache.getQueuedActions()[0].id;
    queue.fail(id, 'err');
    // Advance past retry delay
    send.mockClear();
    jest.advanceTimersByTime(5000);
    // flush-queue should have been called via the retry
    expect(send).toHaveBeenCalledWith('flush-queue', expect.any(Array));
  });

  test('fail marks action as failed after MAX_ATTEMPTS (3) and sends queue-action-failed', () => {
    cache.queueAction({ type: 'a' });
    const id = cache.getQueuedActions()[0].id;

    // First two failures — should still retry
    queue.fail(id, 'err1');
    jest.advanceTimersByTime(5000);
    queue.fail(id, 'err2');
    jest.advanceTimersByTime(5000);
    // Third failure — should mark failed
    send.mockClear();
    queue.fail(id, 'err3');

    const failedCall = send.mock.calls.find(([ch]) => ch === 'queue-action-failed');
    expect(failedCall).toBeDefined();
    expect(failedCall[1].actionId).toBe(id);
    expect(failedCall[1].error).toBe('err3');

    const action = cache.getQueuedActions()[0];
    expect(action.status).toBe('failed');
  });

  test('fail is a no-op for unknown action ID', () => {
    expect(() => queue.fail('nonexistent-id', 'err')).not.toThrow();
  });

  // --- clear ---

  test('clear empties the queue and sends queue-status with 0', () => {
    cache.queueAction({ type: 'a' });
    queue.clear();
    expect(cache.getQueueLength()).toBe(0);
    const statusCall = send.mock.calls.find(([ch]) => ch === 'queue-status');
    expect(statusCall[1].queued).toBe(0);
    expect(statusCall[1].processing).toBe(false);
  });

  test('clear cancels any pending retry timeout', () => {
    cache.queueAction({ type: 'a' });
    const id = cache.getQueuedActions()[0].id;
    queue.fail(id, 'err');
    // There's now a retry scheduled — clear should cancel it
    send.mockClear();
    queue.clear();
    jest.advanceTimersByTime(5000);
    // flush-queue should NOT be called after clear
    expect(send).not.toHaveBeenCalledWith('flush-queue', expect.anything());
  });

  // --- length getter ---

  test('length reflects current queue size', () => {
    expect(queue.length).toBe(0);
    cache.queueAction({ type: 'a' });
    expect(queue.length).toBe(1);
  });

  // --- destroy ---

  test('destroy cancels pending retry without throwing', () => {
    cache.queueAction({ type: 'a' });
    const id = cache.getQueuedActions()[0].id;
    queue.fail(id, 'err');
    expect(() => queue.destroy()).not.toThrow();
    // Timer should be cleared — no flush after destroy
    send.mockClear();
    jest.advanceTimersByTime(5000);
    expect(send).not.toHaveBeenCalledWith('flush-queue', expect.anything());
  });
});
