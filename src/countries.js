'use strict';

/**
 * Country-scoped paths and labels — aligned with COUNTRY_CONFIG / focused nav spec.
 */

/** @type {Record<string, object>} */
const COUNTRIES = {
  US: {
    id: 'US',
    executivePath: '/country/us/executive',
    executiveLabel: 'White House',
    legislaturePath: '/country/us/legislature',
    legislatureLabel: 'Congress',
    centralBankName: 'Federal Reserve',
    executiveFormation: 'direct_election',
    mapPath: '/country/us/map',
  },
  UK: {
    id: 'UK',
    executivePath: '/country/uk/executive',
    executiveLabel: '10 Downing Street',
    legislaturePath: '/country/uk/legislature',
    legislatureLabel: 'Parliament',
    centralBankName: 'Bank of England',
    executiveFormation: 'parliamentary',
    mapPath: '/country/uk/map',
  },
  CA: {
    id: 'CA',
    executivePath: '/country/ca/executive',
    executiveLabel: 'Parliament Hill',
    legislaturePath: '/country/ca/legislature',
    legislatureLabel: 'Parliament',
    centralBankName: 'Bank of Canada',
    executiveFormation: 'parliamentary',
    mapPath: '/country/ca/map',
  },
  DE: {
    id: 'DE',
    executivePath: '/country/de/executive',
    executiveLabel: 'Federal Chancellery',
    legislaturePath: '/country/de/legislature',
    legislatureLabel: 'Bundestag',
    centralBankName: 'Deutsche Bundesbank',
    executiveFormation: 'parliamentary',
    mapPath: '/country/de/map',
  },
};

/**
 * @param {string|null|undefined} countryId
 */
function getCountryConfig(countryId) {
  if (countryId && !COUNTRIES[countryId]) {
    console.warn(
      `[countries] Unknown countryId "${countryId}" — falling back to US`,
    );
  }
  return COUNTRIES[countryId] ?? COUNTRIES.US;
}

/** @type {typeof COUNTRIES} Alias for spec / parity with the web app */
const COUNTRY_CONFIG = COUNTRIES;

module.exports = { COUNTRIES, COUNTRY_CONFIG, getCountryConfig };
