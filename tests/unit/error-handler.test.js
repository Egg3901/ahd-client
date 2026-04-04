'use strict';

const { net } = require('electron');
const ErrorHandler = require('../../src/error-handler');

describe('ErrorHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new ErrorHandler();
    jest.clearAllMocks();
  });

  // --- getMapping ---

  test('getMapping returns built-in mapping for UNAUTHORIZED', () => {
    const m = handler.getMapping('UNAUTHORIZED');
    expect(m.title).toBe('Session Expired');
    expect(Array.isArray(m.actions)).toBe(true);
  });

  test('getMapping returns built-in mapping for NOT_FOUND', () => {
    const m = handler.getMapping('NOT_FOUND');
    expect(m.title).toBe('Page Not Found');
  });

  test('getMapping returns fallback for unknown code', () => {
    const m = handler.getMapping('TOTALLY_UNKNOWN_CODE');
    expect(m.title).toBe('Something went wrong');
    expect(m.actions).toContain('reload');
  });

  // --- getMappings ---

  test('getMappings returns object containing all built-in codes', () => {
    const all = handler.getMappings();
    expect(all.UNAUTHORIZED).toBeDefined();
    expect(all.NOT_FOUND).toBeDefined();
    expect(all.INTERNAL_ERROR).toBeDefined();
    expect(all.FORBIDDEN).toBeDefined();
    expect(all.BAD_REQUEST).toBeDefined();
  });

  test('getMappings returns a copy (mutation does not affect internal state)', () => {
    const all = handler.getMappings();
    all.UNAUTHORIZED = { title: 'tampered' };
    expect(handler.getMapping('UNAUTHORIZED').title).toBe('Session Expired');
  });

  // --- getVersion ---

  test('getVersion returns null before loadErrorCodes is called', () => {
    expect(handler.getVersion()).toBeNull();
  });

  // --- loadErrorCodes ---

  test('loadErrorCodes resolves without throwing when net.request errors', async () => {
    net.request.mockImplementation(() => {
      const emitter = { setHeader: jest.fn(), end: jest.fn() };
      setTimeout(() => emitter._errorCb && emitter._errorCb(new Error('offline')), 0);
      emitter.on = (evt, cb) => {
        if (evt === 'error') emitter._errorCb = cb;
        return emitter;
      };
      return emitter;
    });

    await expect(handler.loadErrorCodes()).resolves.toBeUndefined();
  });

  test('loadErrorCodes merges new code from server catalog', async () => {
    const catalog = {
      version: '2',
      errors: [{ code: 'RATE_LIMITED', httpStatus: 429, message: 'Too many requests' }],
    };

    net.request.mockImplementation(() => {
      const responseCbs = {};
      const dataCbs = [];
      const req = {
        setHeader: jest.fn(),
        end: jest.fn(),
        on: jest.fn((evt, cb) => {
          if (evt === 'response') responseCbs.response = cb;
          return req;
        }),
      };
      setTimeout(() => {
        const res = {
          statusCode: 200,
          on: jest.fn((evt, cb) => {
            if (evt === 'data') dataCbs.push(cb);
            if (evt === 'end') {
              dataCbs.forEach((d) => d(Buffer.from(JSON.stringify(catalog))));
              cb();
            }
            return res;
          }),
        };
        responseCbs.response(res);
      }, 0);
      return req;
    });

    await handler.loadErrorCodes();

    expect(handler.getVersion()).toBe('2');
    const m = handler.getMapping('RATE_LIMITED');
    expect(m.title).toBe('Too many requests');
  });

  test('loadErrorCodes skips re-fetch when version is unchanged', async () => {
    // Seed version
    handler._version = '1';

    const catalog = { version: '1', errors: [] };
    net.request.mockImplementation(() => {
      const responseCbs = {};
      const req = {
        setHeader: jest.fn(),
        end: jest.fn(),
        on: jest.fn((evt, cb) => {
          if (evt === 'response') responseCbs.response = cb;
          return req;
        }),
      };
      setTimeout(() => {
        const res = {
          statusCode: 200,
          on: jest.fn((evt, cb) => {
            if (evt === 'data') cb(Buffer.from(JSON.stringify(catalog)));
            if (evt === 'end') cb();
            return res;
          }),
        };
        responseCbs.response(res);
      }, 0);
      return req;
    });

    await handler.loadErrorCodes();
    // Version still '1', no new codes added — no crash
    expect(handler.getVersion()).toBe('1');
  });

  test('loadErrorCodes resolves silently on non-200 response', async () => {
    net.request.mockImplementation(() => {
      const responseCbs = {};
      const req = {
        setHeader: jest.fn(),
        end: jest.fn(),
        on: jest.fn((evt, cb) => {
          if (evt === 'response') responseCbs.response = cb;
          return req;
        }),
      };
      setTimeout(() => {
        const res = { statusCode: 503, on: jest.fn() };
        responseCbs.response(res);
      }, 0);
      return req;
    });

    await expect(handler.loadErrorCodes()).resolves.toBeUndefined();
  });
});
