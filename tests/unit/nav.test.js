'use strict';

const { getNavForCountry } = require('../../src/nav');

describe('getNavForCountry()', () => {
  test('US: correct routes and labels', () => {
    const nav = getNavForCountry('US');
    expect(nav.legislature.route).toBe('/legislature/us');
    expect(nav.legislature.label).toBe('Congress');
    expect(nav.executive.route).toBe('/executive/us');
    expect(nav.executive.label).toBe('White House');
    expect(nav.map.route).toBe('/map');
    expect(nav.elections.route).toBe('/elections?country=us');
    expect(nav.parties.route).toBe('/parties?country=us');
    expect(nav.metrics.route).toBe('/metrics?country=us');
    expect(nav.policy.route).toBe('/policy?country=us');
    expect(nav.politicians.route).toBe('/politicians?country=us');
    expect(nav.news.route).toBe('/news?country=us');
    expect(nav.presidentElection).toBe(true);
  });

  test('UK: correct routes and labels', () => {
    const nav = getNavForCountry('UK');
    expect(nav.legislature.route).toBe('/legislature/uk');
    expect(nav.legislature.label).toBe('Parliament');
    expect(nav.executive.route).toBe('/executive/uk');
    expect(nav.executive.label).toBe('10 Downing Street');
    expect(nav.map.route).toBe('/uk/map');
    expect(nav.elections.route).toBe('/elections?country=uk');
    expect(nav.presidentElection).toBe(false);
  });

  test('CA: correct routes and labels', () => {
    const nav = getNavForCountry('CA');
    expect(nav.legislature.route).toBe('/legislature/ca');
    expect(nav.legislature.label).toBe('Parliament');
    expect(nav.executive.route).toBe('/executive/ca');
    expect(nav.executive.label).toBe('Parliament Hill');
    expect(nav.map.route).toBe('/country/ca/map');
    expect(nav.elections.route).toBe('/elections?country=ca');
    expect(nav.presidentElection).toBe(false);
  });

  test('DE: correct routes and labels', () => {
    const nav = getNavForCountry('DE');
    expect(nav.legislature.route).toBe('/legislature/de');
    expect(nav.legislature.label).toBe('Bundestag');
    expect(nav.executive.route).toBe('/executive/de');
    expect(nav.executive.label).toBe('Chancellery');
    expect(nav.map.route).toBe('/country/de/map');
    expect(nav.elections.route).toBe('/elections?country=de');
    expect(nav.presidentElection).toBe(false);
  });

  test('null falls back to US nav', () => {
    const nav = getNavForCountry(null);
    expect(nav.legislature.label).toBe('Congress');
    expect(nav.presidentElection).toBe(true);
  });

  test('unknown country code falls back to US and emits console.warn', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const nav = getNavForCountry('AU');
    expect(nav.legislature.label).toBe('Congress');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('AU'));
    warn.mockRestore();
  });
});
