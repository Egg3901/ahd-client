const { net } = require('electron');
const { EventEmitter } = require('events');
const config = require('./config');

/**
 * SSE client that connects to the game server's /api/events endpoint
 * from the main process. Emits parsed events for other modules to consume.
 * Uses exponential backoff for reconnection.
 */
class SSEClient extends EventEmitter {
  constructor() {
    super();
    this.request = null;
    this.connected = false;
    this.retryCount = 0;
    this.maxRetryDelay = 60000;
    this.baseRetryDelay = 2000;
    this.retryTimeout = null;
    this.cookie = null;
    this.buffer = '';
  }

  setCookie(cookie) {
    this.cookie = cookie;
  }

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
        // Empty line means end of event
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

  disconnect() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.request) {
      try {
        this.request.abort();
      } catch {
        // ignore
      }
      this.request = null;
    }
    this.connected = false;
    this.buffer = '';
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = SSEClient;
