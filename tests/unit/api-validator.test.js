'use strict';

const {
  validateClientNav,
  validateSSEEvent,
  validateErrorCatalog,
  validateThemePatchResponse,
} = require('../../src/api-validator');

// ── validateClientNav ─────────────────────────────────────────────────────────

describe('validateClientNav', () => {
  const validManifest = {
    user: { username: 'alice', isAdmin: false },
    hasCharacter: true,
    characterCountryId: 'US',
    unreadCount: 3,
    unreadMailCount: 1,
    homeState: null,
    currentParty: null,
    activeElection: null,
    activePresidentElectionId: null,
    activePresidentElectionSeatId: null,
    missingDemographics: false,
    funds: null,
    actions: null,
    cashOnHand: null,
    projectedIncome: null,
  };

  test('valid manifest returns valid:true with no errors', () => {
    const { valid, errors } = validateClientNav(validManifest);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test('null input returns valid:false', () => {
    const { valid } = validateClientNav(null);
    expect(valid).toBe(false);
  });

  test('non-object input returns valid:false', () => {
    const { valid } = validateClientNav('string');
    expect(valid).toBe(false);
  });

  test('missing hasCharacter returns valid:false', () => {
    const { valid, errors } = validateClientNav({ user: null });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('hasCharacter'))).toBe(true);
  });

  test('hasCharacter with wrong type returns valid:false', () => {
    const { valid, errors } = validateClientNav({ hasCharacter: 'yes' });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('hasCharacter'))).toBe(true);
  });

  test('user as non-object (not null) returns valid:false', () => {
    const { valid, errors } = validateClientNav({ ...validManifest, user: 'alice' });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('user'))).toBe(true);
  });

  test('user.username as non-string returns valid:false', () => {
    const { valid, errors } = validateClientNav({
      ...validManifest,
      user: { username: 42 },
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('username'))).toBe(true);
  });

  test('user: null is valid (unauthenticated guest)', () => {
    const { valid } = validateClientNav({ ...validManifest, user: null });
    expect(valid).toBe(true);
  });

  test('unreadCount as non-number returns valid:false', () => {
    const { valid, errors } = validateClientNav({
      ...validManifest,
      unreadCount: 'many',
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('unreadCount'))).toBe(true);
  });

  test('optional fields absent is valid', () => {
    const { valid } = validateClientNav({ hasCharacter: false });
    expect(valid).toBe(true);
  });
});

// ── validateSSEEvent ──────────────────────────────────────────────────────────

describe('validateSSEEvent', () => {
  const validEvent = {
    type: 'turn_complete',
    payload: { turn: 5, year: 2026 },
    timestamp: '2026-04-04T12:00:00.000Z',
  };

  test('valid known event returns valid:true', () => {
    const { valid, errors } = validateSSEEvent(validEvent);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test('null input returns valid:false', () => {
    const { valid } = validateSSEEvent(null);
    expect(valid).toBe(false);
  });

  test('missing type returns valid:false', () => {
    const { valid, errors } = validateSSEEvent({ payload: {}, timestamp: 'now' });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('type'))).toBe(true);
  });

  test('missing payload and data returns valid:false', () => {
    const { valid, errors } = validateSSEEvent({ type: 'turn_complete', timestamp: 'now' });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('payload'))).toBe(true);
  });

  test('missing timestamp returns valid:false', () => {
    const { valid, errors } = validateSSEEvent({ type: 'turn_complete', payload: {} });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('timestamp'))).toBe(true);
  });

  test('event with data field (instead of payload) is valid', () => {
    const { valid } = validateSSEEvent({
      type: 'turn_complete',
      data: { turn: 5 },
      timestamp: 'now',
    });
    expect(valid).toBe(true);
  });

  test('unknown event type is valid:true but includes an informational error', () => {
    const { valid, errors } = validateSSEEvent({
      type: 'future_event_type',
      payload: {},
      timestamp: 'now',
    });
    expect(valid).toBe(true);
    expect(errors.some((e) => e.includes('unknown'))).toBe(true);
  });

  test('all known event types pass validation', () => {
    const types = ['turn_complete', 'election_resolved', 'bill_enacted', 'theme_changed'];
    for (const type of types) {
      const { valid } = validateSSEEvent({ type, payload: {}, timestamp: 'now' });
      expect(valid).toBe(true);
    }
  });
});

// ── validateErrorCatalog ──────────────────────────────────────────────────────

describe('validateErrorCatalog', () => {
  const validCatalog = {
    version: '1',
    errors: [
      { code: 'NOT_FOUND', httpStatus: 404, category: 'not_found', message: 'Not found' },
      { code: 'UNAUTHORIZED', httpStatus: 401, category: 'auth', message: 'Auth required' },
    ],
  };

  test('valid catalog returns valid:true', () => {
    const { valid, errors } = validateErrorCatalog(validCatalog);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test('non-object returns valid:false', () => {
    const { valid } = validateErrorCatalog(null);
    expect(valid).toBe(false);
  });

  test('missing errors array returns valid:false', () => {
    const { valid, errors } = validateErrorCatalog({ version: '1' });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('errors array'))).toBe(true);
  });

  test('entry missing code returns valid:false', () => {
    const { valid, errors } = validateErrorCatalog({
      errors: [{ message: 'oops' }],
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('code'))).toBe(true);
  });

  test('entry missing message returns valid:false', () => {
    const { valid, errors } = validateErrorCatalog({
      errors: [{ code: 'ERR' }],
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('message'))).toBe(true);
  });

  test('empty errors array is valid', () => {
    const { valid } = validateErrorCatalog({ version: '1', errors: [] });
    expect(valid).toBe(true);
  });
});

// ── validateThemePatchResponse ────────────────────────────────────────────────

describe('validateThemePatchResponse', () => {
  test('{ success: true } is valid', () => {
    const { valid } = validateThemePatchResponse({ success: true });
    expect(valid).toBe(true);
  });

  test('{ success: false } is invalid', () => {
    const { valid } = validateThemePatchResponse({ success: false });
    expect(valid).toBe(false);
  });

  test('non-object returns invalid', () => {
    const { valid } = validateThemePatchResponse(null);
    expect(valid).toBe(false);
  });
});
