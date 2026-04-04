'use strict';

const { getTitleForPath } = require('../../src/title-for-path');

describe('getTitleForPath()', () => {
  const usNav = {
    legislature: { route: '/country/us/legislature', label: 'Congress' },
    executive: { route: '/country/us/executive', label: 'White House' },
  };
  const ukNav = {
    legislature: { route: '/country/uk/legislature', label: 'Parliament' },
    executive: { route: '/country/uk/executive', label: '10 Downing Street' },
  };

  test('legislature path uses nav.legislature.label for US', () => {
    expect(getTitleForPath('/country/us/legislature', usNav)).toBe(
      'Congress — A House Divided',
    );
  });

  test('legislature path uses nav.legislature.label for UK', () => {
    expect(getTitleForPath('/country/uk/legislature', ukNav)).toBe(
      'Parliament — A House Divided',
    );
  });

  test('executive path uses nav.executive.label', () => {
    expect(getTitleForPath('/country/us/executive', usNav)).toBe(
      'White House — A House Divided',
    );
  });

  test('country metrics path', () => {
    expect(getTitleForPath('/country/us/metrics', usNav)).toBe(
      'National Metrics — A House Divided',
    );
  });

  test('elections path returns Elections title', () => {
    expect(getTitleForPath('/elections?country=us', usNav)).toBe(
      'Elections — A House Divided',
    );
  });

  test('unknown path returns bare app name', () => {
    expect(getTitleForPath('/definitely-404', usNav)).toBe('A House Divided');
  });
});
