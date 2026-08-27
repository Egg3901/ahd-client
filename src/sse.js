const { net } = require('electron');
const { EventEmitter } = require('events');
const activeGameUrl = require('./active-game-url');

/**
 * SSE client that connects to the game server's /api/events endpoint
 * from the main process. Emits parsed events for other modules to consume.
 * Uses exponential backoff for reconnection (2s base, 60s max).
 */
class SSEClient extends EventEmitter {
  constructor() {
    super();
    /** @type {Electron.ClientRequest|null} */
    this.request = null;
    /** @type {boolean} */
    this.connected = false;
    /** @type {number} */
    this.retryCount = 0;
    /** @type {number} Max delay between reconnection attempts (ms) */
    this.maxRetryDelay = 60000;
    /** @type {number} Base delay for exponential backoff (ms) */
    this.baseRetryDelay = 2000;
    /** @type {NodeJS.Timeout|null} */
    this.retryTimeout = null;
    /** @type {string|null} */
    this.cookie = null;
    /** @type {string} Accumulates partial SSE frames */
    this.buffer = '';
    /** @type {number} Max buffer size before forced flush (1 MB) */
    this.maxBufferSize = 1024 * 1024;
    /**
     * Parse state for the frame currently being assembled. These persist
     * across processBuffer() calls because a single SSE frame is routinely
     * split over several TCP chunks — its `event:` line can arrive in one
     * chunk and its `data:` line in the next.
     * @type {string}
     */
    this.pendingEventType = 'message';
    /** @type {string} */
    this.pendingData = '';
  }

  /**
   * Discard any half-assembled frame and reset parse state.
   * @private
   */
  resetParseState() {
    this.buffer = '';
    this.pendingEventType = 'message';
    this.pendingData = '';
  }

  /**
   * Set the authentication cookie string for SSE requests.
   * @param {string} cookie - Cookie header value (e.g. "token=abc; session=xyz")
   */
  setCookie(cookie) {
    this.cookie = cookie;
  }

  /**
   * Emit an error without crashing the main process. Node throws on an
   * 'error' event emitted with no listener, which would take the whole
   * app down with an uncaught-exception dialog (ticket #1182).
   * @private
   * @param {Error} err
   */
  emitError(err) {
    if (this.listenerCount('error') > 0) {
      this.emit('error', err);
    } else {
      console.error('SSE error:', err?.message || err);
    }
  }

  /**
   * Open the SSE connection to /api/events.
   * Automatically disconnects any existing connection first.
   */
  connect() {
    if (this.request) {
      this.disconnect();
    }

    const url = `${activeGameUrl.get()}/api/events`;

    try {
      this.request = net.request({
        url,
        method: 'GET',
      });

      if (this.cookie) {
        this.request.setHeader('Cookie', this.cookie);
      }
      this.request.setHeader('Accept', 'text/event-stream');
      this.request.setHeader('Cache-Control', 'no-cache');

      this.request.on('response', (response) => {
        if (response.statusCode !== 200) {
          const err = new Error(`SSE status ${response.statusCode}`);
          // 404/410: the endpoint no longer exists (the web app removed
          // /api/events in favour of polling). Reconnecting is pointless;
          // degrade to the disconnected state so fallback polling engages.
          if (response.statusCode === 404 || response.statusCode === 410) {
            console.warn('SSE endpoint unavailable:', err.message);
            this.connected = false;
            this.emit('disconnected');
            return;
          }
          this.emitError(err);
          this.scheduleReconnect();
          return;
        }

        this.connected = true;
        this.retryCount = 0;
        this.resetParseState();
        this.emit('connected');

        response.on('data', (chunk) => {
          this.buffer += chunk.toString();

          // Guard against unbounded buffer growth. Drop the half-assembled
          // frame's parse state too, otherwise the truncated `data:` prefix
          // would be glued onto the next frame and emitted as one event.
          if (this.buffer.length > this.maxBufferSize) {
            console.warn('SSE buffer exceeded max size, flushing');
            this.resetParseState();
          }

          this.processBuffer();
        });

        response.on('end', () => {
          this.connected = false;
          this.emit('disconnected');
          this.scheduleReconnect();
        });

        response.on('error', (err) => {
          this.connected = false;
          this.emitError(err);
          this.scheduleReconnect();
        });
      });

      this.request.on('error', (err) => {
        this.connected = false;
        this.emitError(err);
        this.scheduleReconnect();
      });

      this.request.end();
    } catch (err) {
      this.emitError(err);
      this.scheduleReconnect();
    }
  }

  /**
   * Parse complete SSE frames from the internal buffer.
   * Emits 'event' for each complete frame with { type, data }.
   * Also emits the event type as a standalone event (e.g. 'turn_complete').
   * @private
   */
  processBuffer() {
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        this.pendingEventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        this.pendingData +=
          (this.pendingData ? '\n' : '') + line.slice(5).trim();
      } else if (line === '') {
        // Empty line = end of event frame
        if (this.pendingData) {
          let parsed;
          try {
            parsed = JSON.parse(this.pendingData);
          } catch {
            parsed = this.pendingData;
          }
          const type = this.pendingEventType;
          this.emit('event', { type, data: parsed });
          this.emit(type, parsed);
        }
        this.pendingEventType = 'message';
        this.pendingData = '';
      }
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Delay = min(baseRetryDelay * 2^retryCount, maxRetryDelay).
   * @private
   */
  scheduleReconnect() {
    if (this.retryTimeout) return;

    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.retryCount),
      this.maxRetryDelay,
    );
    this.retryCount++;

    this.emit('reconnecting', { delay, attempt: this.retryCount });

    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      this.connect();
    }, delay);
  }

  /**
   * Close the SSE connection and cancel any pending reconnection.
   */
  disconnect() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.request) {
      try {
        this.request.abort();
      } catch {
        // ignore — request may already be closed
      }
      this.request = null;
    }
    this.connected = false;
    this.resetParseState();
  }

  /**
   * @returns {boolean} Whether the SSE connection is currently open.
   */
  isConnected() {
    return this.connected;
  }
}

module.exports = SSEClient;
