const SSEClient = require('../../src/sse');
const { EventEmitter } = require('events');

describe('SSEClient', () => {
  let client;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new SSEClient();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // --- Non-200 responses (ticket #1182: SSE 404 crashed the main process) ---

  /**
   * Fake an Electron response object with the given status code.
   * @param {number} statusCode
   * @returns {EventEmitter & { statusCode: number }}
   */
  function mockResponse(statusCode) {
    const res = new EventEmitter();
    res.statusCode = statusCode;
    return res;
  }

  describe('non-200 responses', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('connect() opens a GET request to /api/events', () => {
      const { net } = require('electron');
      client.connect();
      expect(net.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET' }),
      );
      const url = net.request.mock.calls[0][0].url;
      expect(url).toMatch(/\/api\/events$/);
      client.disconnect();
    });

    test('404 with no error listener does not throw (uncaught exception regression)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      client.connect();
      const req = client.request;
      // Before the fix this threw "Error: SSE status 404" in the main
      // process because 'error' was emitted with no listener attached.
      expect(() => req._emit('response', mockResponse(404))).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
      client.disconnect();
    });

    test('404 emits "disconnected" and does not schedule a reconnect', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const disconnected = jest.fn();
      client.on('disconnected', disconnected);

      client.connect();
      client.request._emit('response', mockResponse(404));

      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(false);
      expect(client.retryTimeout).toBeNull();
      client.disconnect();
    });

    test('410 is treated as a gone endpoint: no reconnect', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      client.connect();
      client.request._emit('response', mockResponse(410));
      expect(client.retryTimeout).toBeNull();
      client.disconnect();
    });

    test('500 emits a safe error and schedules a reconnect', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      client.connect();
      const req = client.request;
      const connectSpy = jest
        .spyOn(client, 'connect')
        .mockImplementation(() => {});

      req._emit('response', mockResponse(500));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0].message).toBe('SSE status 500');
      expect(client.retryTimeout).not.toBeNull();
      jest.advanceTimersByTime(2000);
      expect(connectSpy).toHaveBeenCalledTimes(1);

      connectSpy.mockRestore();
      client.disconnect();
    });

    test('500 with no error listener does not throw either', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      client.connect();
      expect(() =>
        client.request._emit('response', mockResponse(503)),
      ).not.toThrow();
      client.disconnect();
    });

    test('request-level network error with no listener does not throw', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      client.connect();
      const req = client.request;
      expect(() => req._emit('error', new Error('network down'))).not.toThrow();
      expect(client.isConnected()).toBe(false);
      client.disconnect();
    });

    test('request-level network error with a listener is emitted', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const errorHandler = jest.fn();
      client.on('error', errorHandler);
      client.connect();
      client.request._emit('error', new Error('network down'));
      expect(errorHandler).toHaveBeenCalledTimes(1);
      client.disconnect();
    });
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

  // --- Frames split across TCP chunks ---
  //
  // A single SSE frame is routinely delivered over more than one 'data'
  // chunk. Parse state used to be local to processBuffer(), so the `event:`
  // line was forgotten between chunks and the frame surfaced as a generic
  // 'message' — silently skipping the turn_complete / theme_changed
  // listeners and the post-turn dashboard re-poll.

  test('event type survives a frame split between the event: and data: lines', () => {
    const handler = jest.fn();
    const typed = jest.fn();
    client.on('event', handler);
    client.on('turn_complete', typed);

    client.buffer += 'event: turn_complete\n';
    client.processBuffer();
    client.buffer += 'data: {"turn":5}\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: 'turn_complete',
      data: { turn: 5 },
    });
    expect(typed).toHaveBeenCalledWith({ turn: 5 });
  });

  test('frame split mid-line still parses once the remainder arrives', () => {
    const handler = jest.fn();
    client.on('event', handler);

    client.buffer += 'event: election_res';
    client.processBuffer();
    expect(handler).not.toHaveBeenCalled();

    client.buffer += 'olved\ndata: {"winner":"A"}\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenCalledWith({
      type: 'election_resolved',
      data: { winner: 'A' },
    });
  });

  test('multi-line data: accumulates across chunks', () => {
    const handler = jest.fn();
    client.on('event', handler);

    client.buffer += 'event: notification\ndata: line one\n';
    client.processBuffer();
    client.buffer += 'data: line two\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenCalledWith({
      type: 'notification',
      data: 'line one\nline two',
    });
  });

  test('event type does not leak from one frame into the next', () => {
    const handler = jest.fn();
    client.on('event', handler);

    client.buffer += 'event: turn_complete\ndata: {"turn":1}\n\n';
    client.processBuffer();
    // A following frame with no event: line is a plain message again.
    client.buffer += 'data: {"msg":"plain"}\n\n';
    client.processBuffer();

    expect(handler).toHaveBeenNthCalledWith(2, {
      type: 'message',
      data: { msg: 'plain' },
    });
  });

  test('resetParseState drops a half-assembled frame', () => {
    const handler = jest.fn();
    client.on('event', handler);

    client.buffer += 'event: turn_complete\ndata: {"turn":9}\n';
    client.processBuffer();
    client.resetParseState();
    client.buffer += '\n';
    client.processBuffer();

    expect(handler).not.toHaveBeenCalled();
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
