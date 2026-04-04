'use strict';

const { getNavForCountry } = require('../../src/nav');

describe('getNavForCountry()', () => {
  test('US: correct routes and labels', () => {
    const nav = getNavForCountry('US');
    expect(nav.legislature.route).toBe('/country/us/legislature');
    expect(nav.legislature.label).toBe('Congress');
    expect(nav.executive.route).toBe('/country/us/executive');
    expect(nav.executive.label).toBe('White House');
    expect(nav.map.route).toBe('/country/us/map');
    expect(nav.elections.route).toBe('/country/us/elections');
    expect(nav.parties.route).toBe('/country/us/parties');
    expect(nav.metrics.route).toBe('/country/us/metrics');
    expect(nav.policy.route).toBe('/country/us/policy');
    expect(nav.politicians.route).toBe('/country/us/politicians');
    expect(nav.news.route).toBe('/news?country=us');
    expect(nav.budget.route).toBe('/country/us/budget');
    expect(nav.centralBank.label).toBe('Federal Reserve');
    expect(nav.presidentElection).toBe(true);
  });

  test('UK: correct routes and labels', () => {
    const nav = getNavForCountry('UK');
    expect(nav.legislature.route).toBe('/country/uk/legislature');
    expect(nav.legislature.label).toBe('Parliament');
    expect(nav.executive.route).toBe('/country/uk/executive');
    expect(nav.executive.label).toBe('10 Downing Street');
    expect(nav.map.route).toBe('/country/uk/map');
    expect(nav.elections.route).toBe('/country/uk/elections');
    expect(nav.presidentElection).toBe(false);
  });

  test('CA: correct routes and labels', () => {
    const nav = getNavForCountry('CA');
    expect(nav.legislature.route).toBe('/country/ca/legislature');
    expect(nav.legislature.label).toBe('Parliament');
    expect(nav.executive.route).toBe('/country/ca/executive');
    expect(nav.executive.label).toBe('Parliament Hill');
    expect(nav.map.route).toBe('/country/ca/map');
    expect(nav.elections.route).toBe('/country/ca/elections');
    expect(nav.presidentElection).toBe(false);
  });

  test('DE: correct routes and labels', () => {
    const nav = getNavForCountry('DE');
    expect(nav.legislature.route).toBe('/country/de/legislature');
    expect(nav.legislature.label).toBe('Bundestag');
    expect(nav.executive.route).toBe('/country/de/executive');
    expect(nav.executive.label).toBe('Federal Chancellery');
    expect(nav.map.route).toBe('/country/de/map');
    expect(nav.elections.route).toBe('/country/de/elections');
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
