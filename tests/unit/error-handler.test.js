'use strict';

/**
 * ErrorHandler unit tests.
 *
 * net.request is mocked at module level (Jest hoisting requirement).
 * Each test configures mockImplementationOnce to simulate a specific
 * HTTP response scenario.
 */

const { EventEmitter } = require('events');

jest.mock('electron', () => ({
  net: { request: jest.fn() },
}));

const { net } = require('electron');
const ErrorHandler = require('../../src/error-handler');

/**
 * Configure the next net.request call to simulate a given HTTP response.
 * @param {{ statusCode?: number, body?: string, networkError?: string }} opts
 */
function setupResponse({
  statusCode = 200,
  body = '',
  networkError = null,
} = {}) {
  net.request.mockImplementationOnce(() => {
    const reqEmitter = new EventEmitter();
    const req = {
      setHeader: jest.fn(),
      on: jest.fn((ev, fn) => {
        reqEmitter.on(ev, fn);
        return req;
      }),
      end: jest.fn(() => {
        if (networkError) {
          setImmediate(() => reqEmitter.emit('error', new Error(networkError)));
          return;
        }
        const resEmitter = new EventEmitter();
        resEmitter.statusCode = statusCode;
        setImmediate(() => {
          reqEmitter.emit('response', resEmitter);
          resEmitter.emit('data', Buffer.from(body));
          resEmitter.emit('end');
        });
      }),
    };
    return req;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ErrorHandler', () => {
  // --- getOverlayMessage (static, no network) ---

  describe('getOverlayMessage', () => {
    test('returns the not-found message for "not-found" type', () => {
      const h = new ErrorHandler();
      expect(h.getOverlayMessage('not-found')).toBe(
        "This page isn't available yet",
      );
    });

    test('returns the connection message for "connection" type', () => {
      const h = new ErrorHandler();
      expect(h.getOverlayMessage('connection')).toBe(
        "Couldn't connect — check your internet connection",
      );
    });

    test('falls back to connection message for an unknown type', () => {
      const h = new ErrorHandler();
      expect(h.getOverlayMessage('banana')).toBe(
        "Couldn't connect — check your internet connection",
      );
    });
  });

  // --- findByCode before catalog loaded ---

  test('findByCode returns null when catalog is empty', () => {
    const h = new ErrorHandler();
    expect(h.findByCode('NOT_FOUND')).toBeNull();
  });

  // --- loadErrorCodes: 200 success ---

  test('loadErrorCodes populates catalog on 200 response', async () => {
    const errors = [
      {
        code: 'NOT_FOUND',
        httpStatus: 404,
        category: 'not_found',
        message: 'Not found',
      },
      {
        code: 'UNAUTHORIZED',
        httpStatus: 401,
        category: 'auth',
        message: 'Unauthorized',
      },
    ];
    setupResponse({ body: JSON.stringify({ version: '1', errors }) });

    const h = new ErrorHandler();
    await h.loadErrorCodes();

    expect(h.findByCode('NOT_FOUND')).toEqual(errors[0]);
    expect(h.findByCode('UNAUTHORIZED')).toEqual(errors[1]);
  });

  test('loadErrorCodes stores the catalog version', async () => {
    setupResponse({ body: JSON.stringify({ version: '42', errors: [] }) });

    const h = new ErrorHandler();
    await h.loadErrorCodes();

    expect(h._catalogVersion).toBe('42');
  });

  // --- loadErrorCodes: non-200 ---

  test('loadErrorCodes resolves without populating catalog on non-200 response', async () => {
    setupResponse({ statusCode: 503, body: 'Service Unavailable' });

    const h = new ErrorHandler();
    await h.loadErrorCodes();

    expect(h._catalog).toEqual([]);
  });

  // --- loadErrorCodes: network error ---

  test('loadErrorCodes resolves without throwing on network error', async () => {
    setupResponse({ networkError: 'ECONNREFUSED' });

    const h = new ErrorHandler();
    await expect(h.loadErrorCodes()).resolves.toBeUndefined();
    expect(h._catalog).toEqual([]);
  });

  // --- loadErrorCodes: bad JSON ---

  test('loadErrorCodes resolves without throwing on invalid JSON body', async () => {
    setupResponse({ body: 'this is not json' });

    const h = new ErrorHandler();
    await expect(h.loadErrorCodes()).resolves.toBeUndefined();
    expect(h._catalog).toEqual([]);
  });

  // --- loadErrorCodes: missing errors array ---

  test('loadErrorCodes ignores a response without an errors array', async () => {
    setupResponse({ body: JSON.stringify({ version: '1', data: [] }) });

    const h = new ErrorHandler();
    await h.loadErrorCodes();

    expect(h._catalog).toEqual([]);
  });

  // --- findByCode after catalog loaded ---

  test('findByCode returns null for an unknown code', async () => {
    setupResponse({
      body: JSON.stringify({
        version: '1',
        errors: [{ code: 'FORBIDDEN', httpStatus: 403 }],
      }),
    });

    const h = new ErrorHandler();
    await h.loadErrorCodes();

    expect(h.findByCode('NONEXISTENT')).toBeNull();
  });

  // --- getOverlayMessage is catalog-independent ---

  test('getOverlayMessage stays constant regardless of catalog contents', async () => {
    setupResponse({
      body: JSON.stringify({
        version: '1',
        errors: [
          { code: 'NOT_FOUND', httpStatus: 404, message: 'Server message' },
        ],
      }),
    });

    const h = new ErrorHandler();
    await h.loadErrorCodes();

    // Overlay messages are client-side constants — catalog does not override them
    expect(h.getOverlayMessage('not-found')).toBe(
      "This page isn't available yet",
    );
  });
});
