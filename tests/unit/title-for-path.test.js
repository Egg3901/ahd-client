'use strict';

const { getTitleForPath } = require('../../src/title-for-path');

describe('getTitleForPath()', () => {
  const usNav = {
    legislature: { route: '/legislature/us', label: 'Congress' },
    executive:   { route: '/executive/us',   label: 'White House' },
  };
  const ukNav = {
    legislature: { route: '/legislature/uk', label: 'Parliament' },
    executive:   { route: '/executive/uk',   label: '10 Downing Street' },
  };

  test('legislature path uses nav.legislature.label for US', () => {
    expect(getTitleForPath('/legislature/us', usNav)).toBe('Congress — A House Divided');
  });

  test('legislature path uses nav.legislature.label for UK', () => {
    expect(getTitleForPath('/legislature/uk', ukNav)).toBe('Parliament — A House Divided');
  });

  test('elections path returns Elections title', () => {
    expect(getTitleForPath('/elections?country=us', usNav)).toBe('Elections — A House Divided');
  });

  test('unknown path returns bare app name', () => {
    expect(getTitleForPath('/definitely-404', usNav)).toBe('A House Divided');
  });
});
