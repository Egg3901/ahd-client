'use strict';

/**
 * URL helpers matching the focused-view / website nav spec (region paths, country routes).
 */

/**
 * @param {string} stateId
 * @returns {"US" | "UK" | "CA" | "DE"}
 */
function getCountryIdFromStateId(stateId) {
  if (stateId.startsWith('UK_')) return 'UK';
  if (stateId.startsWith('CA_')) return 'CA';
  if (stateId.startsWith('DE_')) return 'DE';
  return 'US';
}

/**
 * @param {string} stateId
 * @returns {string}
 */
function regionCodeFromStateId(stateId) {
  const upper = stateId.toUpperCase();
  if (upper.startsWith('UK_')) return upper.slice(3);
  if (upper.startsWith('CA_')) return upper.slice(3);
  if (upper.startsWith('DE_')) return upper.slice(3);
  return upper;
}

/**
 * @param {string} countryId
 * @param {string} regionCode
 * @returns {string}
 */
function regionUrl(countryId, regionCode) {
  return `/country/${countryId.toLowerCase()}/region/${regionCode.toUpperCase()}`;
}

/**
 * @param {string} stateId
 * @returns {string}
 */
function regionUrlFromStateId(stateId) {
  const countryId = getCountryIdFromStateId(stateId);
  return regionUrl(countryId, regionCodeFromStateId(stateId));
}

/**
 * @param {string} stateId
 * @param {string} partyId
 * @returns {string}
 */
function regionPartyUrlFromStateId(stateId, partyId) {
  return `${regionUrlFromStateId(stateId)}/party/${partyId}`;
}

/**
 * @param {string} stateId
 * @returns {string}
 */
function regionLegislatureUrlFromStateId(stateId) {
  return `${regionUrlFromStateId(stateId)}/legislature`;
}

/**
 * @param {string} countryId
 * @param {string} partyId
 */
function partyUrl(countryId, partyId) {
  return `/country/${countryId.toLowerCase()}/parties/${partyId}`;
}

/** @param {string} countryId */
function partiesUrl(countryId) {
  return `/country/${countryId.toLowerCase()}/parties`;
}

/** @param {string} countryId */
function countryElectionsUrl(countryId) {
  return `/country/${countryId.toLowerCase()}/elections`;
}

/** @param {string} countryId */
function metricsUrl(countryId) {
  return `/country/${countryId.toLowerCase()}/metrics`;
}

/** @param {string} countryId */
function policyUrl(countryId) {
  return `/country/${countryId.toLowerCase()}/policy`;
}

/** @param {string} countryId */
function politiciansUrl(countryId) {
  return `/country/${countryId.toLowerCase()}/politicians`;
}

/** @param {string} countryId */
function budgetUrl(countryId) {
  return `/country/${countryId.toLowerCase()}/budget`;
}

/** @param {string} countryId */
function centralBankUrl(countryId) {
  return `/country/${countryId.toLowerCase()}/central-bank`;
}

module.exports = {
  getCountryIdFromStateId,
  regionCodeFromStateId,
  regionUrl,
  regionUrlFromStateId,
  regionPartyUrlFromStateId,
  regionLegislatureUrlFromStateId,
  partyUrl,
  partiesUrl,
  countryElectionsUrl,
  metricsUrl,
  policyUrl,
  politiciansUrl,
  budgetUrl,
  centralBankUrl,
};
