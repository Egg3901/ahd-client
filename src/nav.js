'use strict';

const { getCountryConfig } = require('./countries');
const urls = require('./urls');

/**
 * Build country-aware navigation routes for the app menu and window presets.
 * Paths align with `/country/{cc}/…` and region URLs from `urls`.
 *
 * @param {string|null|undefined} countryId
 */
function getNavForCountry(countryId) {
  const c = getCountryConfig(countryId);
  const id = c.id;

  return {
    executive: { route: c.executivePath, label: c.executiveLabel },
    legislature: { route: c.legislaturePath, label: c.legislatureLabel },
    map: { route: c.mapPath, label: 'Map' },
    elections: { route: urls.countryElectionsUrl(id) },
    parties: { route: urls.partiesUrl(id) },
    metrics: { route: urls.metricsUrl(id) },
    policy: { route: urls.policyUrl(id) },
    politicians: { route: urls.politiciansUrl(id) },
    news: { route: `/news?country=${id.toLowerCase()}` },
    budget: { route: urls.budgetUrl(id) },
    centralBank: {
      route: urls.centralBankUrl(id),
      label: c.centralBankName,
    },
    campaign: { route: '/campaign', label: 'Campaign Manager' },
    executiveFormation: c.executiveFormation,
    presidentElection: c.executiveFormation === 'direct_election',
  };
}

/** @deprecated Use getCountryConfig / urls — kept for tests that import shape */
const COUNTRY_NAV = {
  US: getNavForCountry('US'),
  UK: getNavForCountry('UK'),
  CA: getNavForCountry('CA'),
  DE: getNavForCountry('DE'),
};

module.exports = { getNavForCountry, COUNTRY_NAV };
