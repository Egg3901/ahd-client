'use strict';

const {
  formatCompactAbs,
  formatMoneyCompact,
} = require('../../src/format-compact-number');

describe('formatCompactAbs', () => {
  test('small values unchanged', () => {
    expect(formatCompactAbs(0)).toBe('0');
    expect(formatCompactAbs(999)).toBe('999');
  });

  test('thousands with k', () => {
    expect(formatCompactAbs(1000)).toBe('1k');
    expect(formatCompactAbs(130190)).toBe('130.19k');
    expect(formatCompactAbs(10500)).toBe('10.5k');
  });

  test('millions with m', () => {
    expect(formatCompactAbs(140000000)).toBe('140m');
    expect(formatCompactAbs(1500000)).toBe('1.5m');
  });

  test('billions with b', () => {
    expect(formatCompactAbs(2500000000)).toBe('2.5b');
  });
});

describe('formatMoneyCompact', () => {
  test('nullish', () => {
    expect(formatMoneyCompact(null)).toBe('—');
    expect(formatMoneyCompact(undefined)).toBe('—');
  });

  test('dollar prefix and compact', () => {
    expect(formatMoneyCompact(130190)).toBe('$130.19k');
    expect(formatMoneyCompact(140000000)).toBe('$140m');
  });

  test('negative', () => {
    expect(formatMoneyCompact(-130190)).toBe('-$130.19k');
  });
});
