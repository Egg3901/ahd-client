'use strict';

const { resolveGamePath } = require('../../src/game-paths');

describe('resolveGamePath', () => {
  test('passes /profile through (focused nav spec)', () => {
    expect(resolveGamePath('/profile')).toBe('/profile');
  });

  test('accepts profile without leading slash', () => {
    expect(resolveGamePath('profile')).toBe('/profile');
  });

  test('passes other paths through unchanged', () => {
    expect(resolveGamePath('/campaign')).toBe('/campaign');
    expect(resolveGamePath('/settings')).toBe('/settings');
  });
});
