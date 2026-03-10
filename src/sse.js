const { net } = require('electron');
const { EventEmitter } = require('events');
const config = require('./config');

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
  }

  /**
   * Set the authentication cookie string for SSE requests.
   * @param {string} cookie - Cookie header value (e.g. "token=abc; session=xyz")
   */
  setCookie(cookie) {
    this.cookie = cookie;
  }

  /**
   * Open the SSE connection to /api/events.
   * Automatically disconnects any existing connection first.
   */
  connect() {
    if (this.request) {
      this.disconnect();
    }

    const url = `${config.GAME_URL}/api/events`;

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
          this.emit('error', new Error(`SSE status ${response.statusCode}`));
          this.scheduleReconnect();
          return;
        }

        this.connected = true;
        this.retryCount = 0;
        this.buffer = '';
        this.emit('connected');

        response.on('data', (chunk) => {
          this.buffer += chunk.toString();

          // Guard against unbounded buffer growth
          if (this.buffer.length > this.maxBufferSize) {
            console.warn('SSE buffer exceeded max size, flushing');
            this.buffer = '';
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
          this.emit('error', err);
          this.scheduleReconnect();
        });
      });

      this.request.on('error', (err) => {
        this.connected = false;
        this.emit('error', err);
        this.scheduleReconnect();
      });

      this.request.end();
    } catch (err) {
      this.emit('error', err);
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

    let eventType = 'message';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += (data ? '\n' : '') + line.slice(5).trim();
      } else if (line === '') {
        // Empty line = end of event frame
        if (data) {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          this.emit('event', { type: eventType, data: parsed });
          this.emit(eventType, parsed);
        }
        eventType = 'message';
        data = '';
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
    this.buffer = '';
  }

  /**
   * @returns {boolean} Whether the SSE connection is currently open.
   */
  isConnected() {
    return this.connected;
  }
}

module.exports = SSEClient;
