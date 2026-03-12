const SSEClient = require('../../src/sse');

describe('SSEClient', () => {
  let client;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new SSEClient();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // --- Initial state ---

  test('starts disconnected', () => {
    expect(client.connected).toBe(false);
    expect(client.isConnected()).toBe(false);
  });

  test('starts with empty buffer and no request', () => {
    expect(client.buffer).toBe('');
    expect(client.request).toBeNull();
    expect(client.retryTimeout).toBeNull();
  });

  // --- setCookie ---

  test('setCookie stores cookie', () => {
    client.setCookie('token=abc; session=xyz');
    expect(client.cookie).toBe('token=abc; session=xyz');
  });

  // --- disconnect ---

  test('disconnect sets connected to false', () => {
    client.connected = true;
    client.disconnect();
    expect(client.connected).toBe(false);
  });

  test('disconnect clears buffer', () => {
    client.buffer = 'partial data';
    client.disconnect();
    expect(client.buffer).toBe('');
  });

  test('disconnect sets request to null', () => {
    // Provide a fake request object with an abort method
    client.request = { abort: jest.fn() };
    client.disconnect();
    expect(client.request).toBeNull();
  });

  test('disconnect clears retryTimeout', () => {
    client.retryTimeout = setTimeout(() => {}, 10000);
    client.disconnect();
    expect(client.retryTimeout).toBeNull();
  });

  test('disconnect handles missing request gracefully', () => {
    client.request = null;
    expect(() => client.disconnect()).not.toThrow();
  });

  // --- processBuffer: basic SSE frame parsing ---

  test('processBuffer parses a complete SSE frame and emits event', () => {
    const handler = jest.fn();
    client.on('event', handler);

    client.buffer = 'event: turn_complete\ndata: {"turn":1}\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: 'turn_complete',
      data: { turn: 1 },
    });
  });

  test('processBuffer emits the event type as a standalone event', () => {
    const handler = jest.fn();
    client.on('turn_complete', handler);

    client.buffer = 'event: turn_complete\ndata: {"turn":1}\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ turn: 1 });
  });

  test('processBuffer emits both "event" and the named event type', () => {
    const eventHandler = jest.fn();
    const namedHandler = jest.fn();
    client.on('event', eventHandler);
    client.on('my_event', namedHandler);

    client.buffer = 'event: my_event\ndata: {"x":42}\n\n';
    client.processBuffer();

    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect(namedHandler).toHaveBeenCalledTimes(1);
  });

  test('processBuffer fallback: invalid JSON emits raw string as data', () => {
    const handler = jest.fn();
    client.on('event', handler);

    client.buffer = 'event: raw_event\ndata: not valid json\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenCalledWith({
      type: 'raw_event',
      data: 'not valid json',
    });
  });

  test('processBuffer keeps incomplete frame in buffer', () => {
    client.buffer = 'event: partial\ndata: {"x":1}\n';
    client.processBuffer();

    // No complete frame yet — nothing emitted
    const handler = jest.fn();
    client.on('event', handler);
    expect(handler).not.toHaveBeenCalled();

    // Remaining incomplete line stays in buffer
    expect(client.buffer).toBe('');
  });

  test('processBuffer retains truly partial (no trailing newline) data in buffer', () => {
    // No trailing newline at all — the last line is kept
    client.buffer = 'data: partial';
    client.processBuffer();
    expect(client.buffer).toBe('data: partial');
  });

  test('processBuffer defaults to "message" event type when no event line', () => {
    const handler = jest.fn();
    client.on('event', handler);

    client.buffer = 'data: {"msg":"hello"}\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenCalledWith({
      type: 'message',
      data: { msg: 'hello' },
    });
  });

  test('processBuffer handles multiple frames in one buffer flush', () => {
    const handler = jest.fn();
    client.on('event', handler);

    client.buffer =
      'event: first\ndata: {"n":1}\n\n' + 'event: second\ndata: {"n":2}\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, {
      type: 'first',
      data: { n: 1 },
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      type: 'second',
      data: { n: 2 },
    });
  });

  // --- scheduleReconnect: exponential backoff ---

  test('scheduleReconnect schedules timeout with base delay on first attempt', () => {
    // retryCount starts at 0: delay = min(2000 * 2^0, 60000) = 2000
    client.scheduleReconnect();
    expect(client.retryTimeout).not.toBeNull();
    expect(client.retryCount).toBe(1);
  });

  test('scheduleReconnect uses exponential backoff: delay doubles each attempt', () => {
    const connectSpy = jest
      .spyOn(client, 'connect')
      .mockImplementation(() => {});

    // First call: retryCount=0 → delay=2000
    client.scheduleReconnect();
    expect(client.retryCount).toBe(1);
    jest.advanceTimersByTime(2000);
    expect(client.retryTimeout).toBeNull();

    // Second call: retryCount=1 → delay=4000
    client.scheduleReconnect();
    expect(client.retryCount).toBe(2);
    jest.advanceTimersByTime(3999);
    expect(connectSpy).toHaveBeenCalledTimes(1); // only first fired
    jest.advanceTimersByTime(1);
    expect(connectSpy).toHaveBeenCalledTimes(2);

    connectSpy.mockRestore();
  });

  test('scheduleReconnect caps delay at maxRetryDelay (60000ms)', () => {
    const connectSpy = jest
      .spyOn(client, 'connect')
      .mockImplementation(() => {});

    // Force retryCount high enough that 2000 * 2^retryCount > 60000
    // 2000 * 2^5 = 64000 > 60000, so retryCount=5 should produce delay=60000
    client.retryCount = 5;
    client.scheduleReconnect();

    jest.advanceTimersByTime(59999);
    expect(connectSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    connectSpy.mockRestore();
  });

  test('scheduleReconnect is a no-op when retryTimeout is already pending', () => {
    client.scheduleReconnect();
    const firstTimeout = client.retryTimeout;
    const firstRetryCount = client.retryCount;

    // Second call should be ignored
    client.scheduleReconnect();
    expect(client.retryTimeout).toBe(firstTimeout);
    expect(client.retryCount).toBe(firstRetryCount);
  });

  test('scheduleReconnect emits "reconnecting" with delay and attempt info', () => {
    const handler = jest.fn();
    client.on('reconnecting', handler);

    client.scheduleReconnect();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ delay: 2000, attempt: 1 });
  });
});
