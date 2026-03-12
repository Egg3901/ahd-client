'use strict';

const COUNTRY_NAV = {
  US: {
    executive: { route: '/executive/us', label: 'White House' },
    legislature: { route: '/legislature/us', label: 'Congress' },
    map: { route: '/map', label: 'Map' },
    elections: { route: '/elections?country=us' },
    parties: { route: '/parties?country=us' },
    metrics: { route: '/metrics?country=us' },
    policy: { route: '/policy?country=us' },
    politicians: { route: '/politicians?country=us' },
    news: { route: '/news?country=us' },
    presidentElection: true,
  },
  UK: {
    executive: { route: '/executive/uk', label: '10 Downing Street' },
    legislature: { route: '/legislature/uk', label: 'Parliament' },
    map: { route: '/uk/map', label: 'Map' },
    elections: { route: '/elections?country=uk' },
    parties: { route: '/parties?country=uk' },
    metrics: { route: '/metrics?country=uk' },
    policy: { route: '/policy?country=uk' },
    politicians: { route: '/politicians?country=uk' },
    news: { route: '/news?country=uk' },
    presidentElection: false,
  },
  CA: {
    executive: { route: '/executive/ca', label: 'Parliament Hill' },
    legislature: { route: '/legislature/ca', label: 'Parliament' },
    map: { route: '/country/ca/map', label: 'Map' },
    elections: { route: '/elections?country=ca' },
    parties: { route: '/parties?country=ca' },
    metrics: { route: '/metrics?country=ca' },
    policy: { route: '/policy?country=ca' },
    politicians: { route: '/politicians?country=ca' },
    news: { route: '/news?country=ca' },
    presidentElection: false,
  },
  DE: {
    executive: { route: '/executive/de', label: 'Chancellery' },
    legislature: { route: '/legislature/de', label: 'Bundestag' },
    map: { route: '/country/de/map', label: 'Map' },
    elections: { route: '/elections?country=de' },
    parties: { route: '/parties?country=de' },
    metrics: { route: '/metrics?country=de' },
    policy: { route: '/policy?country=de' },
    politicians: { route: '/politicians?country=de' },
    news: { route: '/news?country=de' },
    presidentElection: false,
  },
};

function getNavForCountry(countryId) {
  if (countryId && !COUNTRY_NAV[countryId]) {
    console.warn(
      `[nav] Unknown countryId "${countryId}" — falling back to US nav`,
    );
  }
  return COUNTRY_NAV[countryId] ?? COUNTRY_NAV.US;
}

module.exports = { getNavForCountry, COUNTRY_NAV };
