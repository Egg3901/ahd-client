'use strict';

const urls = require('../../src/urls');

describe('urls helpers', () => {
  test('getCountryIdFromStateId and regionCodeFromStateId', () => {
    expect(urls.getCountryIdFromStateId('UK_ENG')).toBe('UK');
    expect(urls.getCountryIdFromStateId('CA_AB')).toBe('CA');
    expect(urls.getCountryIdFromStateId('DE_BE')).toBe('DE');
    expect(urls.getCountryIdFromStateId('US_CA')).toBe('US');

    expect(urls.regionCodeFromStateId('UK_WAL')).toBe('WAL');
    expect(urls.regionCodeFromStateId('US_CA')).toBe('US_CA');
  });

  test('regionUrl and regionUrlFromStateId', () => {
    expect(urls.regionUrl('US', 'CA')).toBe('/country/us/region/CA');
    expect(urls.regionUrlFromStateId('CA_AB')).toBe('/country/ca/region/AB');
    expect(urls.regionUrlFromStateId('US_TX')).toBe('/country/us/region/US_TX');
  });

  test('region party and legislature URLs', () => {
    expect(urls.regionPartyUrlFromStateId('US_CA', 'p1')).toBe(
      '/country/us/region/US_CA/party/p1',
    );
    expect(urls.regionLegislatureUrlFromStateId('US_CA')).toBe(
      '/country/us/region/US_CA/legislature',
    );
  });

  test('country-scoped game paths', () => {
    expect(urls.partiesUrl('US')).toBe('/country/us/parties');
    expect(urls.metricsUrl('UK')).toBe('/country/uk/metrics');
    expect(urls.budgetUrl('CA')).toBe('/country/ca/budget');
    expect(urls.partyUrl('US', 'pid')).toBe('/country/us/parties/pid');
  });
});
