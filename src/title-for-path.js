'use strict';

/**
 * Map a URL path to a human-readable window title segment.
 * Extracted from main.js so it can be unit-tested independently.
 * @param {string} path - e.g. '/legislature/us' or '/elections?country=us'
 * @param {{ legislature: {label: string}, executive: {label: string} }} nav
 * @returns {string}
 */
function getTitleForPath(path, nav) {
  const segment = (path.split('/').filter(Boolean)[0] || '').split('?')[0];
  const titles = {
    '': 'Home',
    politician: 'My Politician',
    campaign: 'Campaign HQ',
    notifications: 'Notifications',
    achievements: 'Achievements',
    elections: 'Elections',
    legislature: nav.legislature.label,
    executive: nav.executive ? nav.executive.label : 'Executive',
    bills: 'Legislature',
    state: 'State',
    country: 'Country',
    world: 'World / Nations',
    parties: 'Political Parties',
    metrics: 'National Metrics',
    policy: 'Policy',
    politicians: 'Politicians',
    news: 'News',
    wiki: 'Game Wiki',
    roadmap: 'Roadmap',
    changelog: 'Changelog',
    admin: 'Admin',
    login: 'Login',
    register: 'Register',
    settings: 'Settings',
    feedback: 'Feedback',
    actions: 'Actions',
    profile: 'Profile',
  };
  const title = titles[segment];
  if (title === undefined) return 'A House Divided';
  if (!title) return 'A House Divided';
  return `${title} \u2014 A House Divided`;
}

module.exports = { getTitleForPath };
