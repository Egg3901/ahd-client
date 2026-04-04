'use strict';

/**
 * UK devolved legislature labels and party-link adjectives (homeState.id starts with UK_).
 * First path segment after UK_ is the nation code (SCO, WAL, NIR, ENG, …).
 */

/** @type {Record<string, { legislature: string; adjective: string }>} */
const UK_NATION = {
  SCO: { legislature: 'Scottish Parliament', adjective: 'Scottish' },
  WAL: { legislature: 'Senedd Cymru', adjective: 'Welsh' },
  NIR: { legislature: 'Northern Ireland Assembly', adjective: 'Northern Irish' },
  ENG: { legislature: 'State Legislature', adjective: 'English' },
};

/**
 * @param {string} stateId
 * @returns {string}
 */
function getStateLegislatureLabel(stateId) {
  if (!stateId.startsWith('UK_')) return 'State Legislature';
  const nation = stateId.slice(3).split('_')[0];
  return UK_NATION[nation]?.legislature ?? 'State Legislature';
}

/**
 * @param {{ id: string; name: string }} homeState
 * @returns {string}
 */
function getStatePartyLinkAdjective(homeState) {
  const stateId = homeState.id;
  if (!stateId.startsWith('UK_')) return homeState.name;
  const nation = stateId.slice(3).split('_')[0];
  return UK_NATION[nation]?.adjective ?? homeState.name;
}

module.exports = { getStateLegislatureLabel, getStatePartyLinkAdjective };
