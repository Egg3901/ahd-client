'use strict';

const {
  partyLabel,
  electionTypeLabel,
  crisisTypeLabel,
  formatCountdownMs,
  formatCountdownTo,
} = require('../../src/pip-labels');

describe('pip-labels', () => {
  test('partyLabel maps common US slugs', () => {
    expect(partyLabel('democrat')).toBe('Democrats');
    expect(partyLabel('republican')).toBe('Republicans');
    expect(partyLabel('unknown-party-slug')).toBe('Unknown Party Slug');
  });

  test('electionTypeLabel maps house/senate', () => {
    expect(electionTypeLabel('house')).toBe('House');
    expect(electionTypeLabel('senate')).toBe('Senate');
  });

  test('crisisTypeLabel maps known crisis types and falls back', () => {
    expect(crisisTypeLabel('economic_recession')).toBe('Economic Recession');
    expect(crisisTypeLabel('unknown_crisis')).toBe('Unknown Crisis');
  });

  test('formatCountdownMs edge cases', () => {
    expect(formatCountdownMs(-1)).toBe('Ended');
    expect(formatCountdownMs(30_000)).toBe('< 1m');
    expect(formatCountdownMs(90_000)).toBe('1m');
    expect(formatCountdownMs(3_600_000)).toBe('1h 0m');
    expect(formatCountdownMs(90_000_000)).toMatch(/^\d+d \d+h$/);
  });

  test('formatCountdownTo uses wall clock', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(formatCountdownTo(past)).toBe('Ended');
  });
});
