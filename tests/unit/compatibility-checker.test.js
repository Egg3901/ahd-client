'use strict';

const CompatibilityChecker = require('../../src/compatibility-checker');

describe('CompatibilityChecker', () => {
  let cc;

  beforeEach(() => {
    cc = new CompatibilityChecker();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- initial state ---

  test('getStatus initially returns compatible:true with no issues', () => {
    const status = cc.getStatus();
    expect(status.compatible).toBe(true);
    expect(status.issueCount).toBe(0);
    expect(status.issues).toHaveLength(0);
  });

  // --- checkClientNav ---

  test('checkClientNav returns true for a valid manifest', () => {
    const result = cc.checkClientNav({ hasCharacter: false });
    expect(result).toBe(true);
    expect(cc.getStatus().compatible).toBe(true);
  });

  test('checkClientNav returns false and records issue for invalid manifest', () => {
    const result = cc.checkClientNav(null);
    expect(result).toBe(false);
    const status = cc.getStatus();
    expect(status.compatible).toBe(false);
    expect(status.issueCount).toBe(1);
    expect(status.issues[0].endpoint).toBe('/api/client-nav');
  });

  test('checkClientNav logs a warning for invalid manifest', () => {
    cc.checkClientNav(null);
    expect(console.warn).toHaveBeenCalled();
  });

  // --- checkSSEEvent ---

  test('checkSSEEvent returns true for a valid known event', () => {
    const result = cc.checkSSEEvent({
      type: 'turn_complete',
      payload: { turn: 5 },
      timestamp: '2026-04-04T00:00:00Z',
    });
    expect(result).toBe(true);
  });

  test('checkSSEEvent returns false for structurally invalid event', () => {
    const result = cc.checkSSEEvent(null);
    expect(result).toBe(false);
    expect(cc.getStatus().issueCount).toBe(1);
  });

  test('checkSSEEvent records issue for unknown type but returns true', () => {
    const result = cc.checkSSEEvent({
      type: 'totally_unknown',
      payload: {},
      timestamp: 'now',
    });
    expect(result).toBe(true); // unknown type is informational, not a hard failure
    expect(cc.getStatus().issueCount).toBe(1);
    expect(cc.getStatus().issues[0].endpoint).toBe('/api/events');
  });

  // --- checkErrorCatalog ---

  test('checkErrorCatalog returns true for a valid catalog', () => {
    const result = cc.checkErrorCatalog({ version: '1', errors: [] });
    expect(result).toBe(true);
  });

  test('checkErrorCatalog returns false and records issue for invalid catalog', () => {
    const result = cc.checkErrorCatalog({ version: '1' }); // missing errors array
    expect(result).toBe(false);
    expect(cc.getStatus().issues[0].endpoint).toBe('/api/error-codes');
  });

  // --- multiple issues ---

  test('multiple failed checks accumulate issues', () => {
    cc.checkClientNav(null);
    cc.checkSSEEvent(null);
    const status = cc.getStatus();
    expect(status.issueCount).toBe(2);
    expect(status.compatible).toBe(false);
  });

  // --- clearIssues ---

  test('clearIssues resets to compatible state', () => {
    cc.checkClientNav(null);
    expect(cc.getStatus().compatible).toBe(false);
    cc.clearIssues();
    const status = cc.getStatus();
    expect(status.compatible).toBe(true);
    expect(status.issueCount).toBe(0);
  });

  // --- getStatus returns a copy ---

  test('mutating getStatus() result does not affect internal state', () => {
    cc.checkClientNav(null);
    const status = cc.getStatus();
    status.issues.length = 0;
    expect(cc.getStatus().issueCount).toBe(1);
  });

  // --- MAX_ISSUES cap ---

  test('issues are capped at 50 entries (oldest dropped)', () => {
    for (let i = 0; i < 55; i++) {
      cc.checkClientNav(null);
    }
    const status = cc.getStatus();
    expect(status.issueCount).toBe(50);
  });
});
