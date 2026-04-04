'use strict';

const { normalizeClientNavManifest } = require('../../src/nav-manifest');

describe('normalizeClientNavManifest', () => {
  test('prefers camelCase characterCountryId when both are present', () => {
    const m = normalizeClientNavManifest({
      characterCountryId: 'US',
      character_countryId: 'UK',
    });
    expect(m.characterCountryId).toBe('US');
  });

  test('maps character_countryId to characterCountryId', () => {
    const m = normalizeClientNavManifest({ character_countryId: 'CA' });
    expect(m.characterCountryId).toBe('CA');
  });

  test('null country when neither field is set', () => {
    const m = normalizeClientNavManifest({ hasCharacter: true });
    expect(m.characterCountryId).toBeNull();
  });

  test('preserves other manifest fields', () => {
    const m = normalizeClientNavManifest({
      user: { username: 'a', isAdmin: false },
      unreadCount: 3,
    });
    expect(m.unreadCount).toBe(3);
    expect(m.user.username).toBe('a');
  });
});
