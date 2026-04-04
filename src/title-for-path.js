'use strict';

/**
 * Map a URL path to a human-readable window title segment.
 * @param {string} path - e.g. '/country/us/executive' or '/elections?country=us'
 * @param {{ executive: {route: string, label: string}, legislature: {route: string, label: string} }} nav
 * @returns {string}
 */
function getTitleForPath(path, nav) {
  const clean = (path.split('?')[0] || '').replace(/\/+$/, '') || '/';
  if (nav.executive && clean.startsWith(nav.executive.route)) {
    return `${nav.executive.label} \u2014 A House Divided`;
  }
  if (nav.legislature && clean.startsWith(nav.legislature.route)) {
    return `${nav.legislature.label} \u2014 A House Divided`;
  }

  if (clean.startsWith('/country/')) {
    const parts = clean.split('/').filter(Boolean);
    const page = parts[2];
    const byCountryPage = {
      map: 'Map',
      metrics: 'National Metrics',
      policy: 'Policy',
      politicians: 'Politicians',
      parties: 'Political Parties',
      elections: 'Elections',
      budget: 'National Budget',
      'central-bank': 'Central Bank',
      executive: nav.executive?.label || 'Executive',
      legislature: nav.legislature?.label || 'Legislature',
    };
    if (page && byCountryPage[page]) {
      return `${byCountryPage[page]} \u2014 A House Divided`;
    }
    if (page === 'region') {
      return `State \u2014 A House Divided`;
    }
  }

  const segment = (path.split('/').filter(Boolean)[0] || '').split('?')[0];
  const titles = {
    '': 'Home',
    politician: 'My Politician',
    profile: 'Profile',
    campaign: 'Campaign HQ',
    notifications: 'Notifications',
    portfolio: 'Portfolio',
    elections: 'Elections',
    bills: 'Legislature',
    state: 'State',
    country: 'Country',
    world: 'World / Nations',
    parties: 'Political Parties',
    'national-metrics': 'National Metrics',
    metrics: 'National Metrics',
    policy: 'Policy',
    politicians: 'Politicians',
    news: 'News',
    budget: 'National Budget',
    'central-bank': 'Central Bank',
    stockmarket: 'Stock Market',
    corporation: 'Corporation',
    wiki: 'Game Wiki',
    roadmap: 'Roadmap',
    changelog: 'Changelog',
    admin: 'Admin',
    login: 'Login',
    register: 'Register',
    settings: 'Settings',
    feedback: 'Feedback',
    actions: 'Actions',
    map: 'Map',
  };
  const title = titles[segment];
  if (title === undefined) return 'A House Divided';
  if (!title) return 'A House Divided';
  return `${title} \u2014 A House Divided`;
}

module.exports = { getTitleForPath };
