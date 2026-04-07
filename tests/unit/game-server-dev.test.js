'use strict';

describe('game-server-dev', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('isLocalDevServerAllowed is true in development even when not admin', () => {
    process.env.NODE_ENV = 'development';
    const { isLocalDevServerAllowed } = require('../../src/game-server-dev');
    expect(isLocalDevServerAllowed(false)).toBe(true);
  });

  test('isLocalDevServerAllowed is true for admin in production', () => {
    process.env.NODE_ENV = 'production';
    const { isLocalDevServerAllowed } = require('../../src/game-server-dev');
    expect(isLocalDevServerAllowed(true)).toBe(true);
  });

  test('isLocalDevServerAllowed is false for non-admin in production', () => {
    process.env.NODE_ENV = 'production';
    const { isLocalDevServerAllowed } = require('../../src/game-server-dev');
    expect(isLocalDevServerAllowed(false)).toBe(false);
  });
});
