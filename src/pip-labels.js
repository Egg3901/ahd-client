'use strict';

/**
 * Display helpers for PiP (party slugs, election/corp types, country flags).
 * Loaded in pip.html via <script src="pip-labels.js"> (globalThis).
 */

/** @type {Record<string, string>} */
const PARTY_SLUG_LABELS = {
  democrat: 'Democrats',
  democratic: 'Democrats',
  republican: 'Republicans',
  independent: 'Independents',
  libertarian: 'Libertarians',
  green: 'Green Party',
  progressive: 'Progressives',
  conservative: 'Conservative Party',
  labour: 'Labour',
  labourparty: 'Labour',
  'labour-co-operative': 'Labour',
  tory: 'Conservatives',
  conservativeparty: 'Conservatives',
  liberal: 'Liberal Democrats',
  libdem: 'Liberal Democrats',
  snp: 'SNP',
  plaid: 'Plaid Cymru',
  reform: 'Reform UK',
  ndp: 'NDP',
  ndpqc: 'NDP',
  liberalparty: 'Liberal Party',
  bloc: 'Bloc Québécois',
  greenparty: 'Green Party',
  cdu: 'CDU/CSU',
  spd: 'SPD',
  grune: 'Greens',
  gruene: 'Greens',
  afd: 'AfD',
  fdp: 'FDP',
  linke: 'The Left',
  die_linke: 'The Left',
};

/**
 * @param {string} slug
 * @returns {string}
 */
function partyLabel(slug) {
  if (slug == null || slug === '') return '';
  const k = String(slug).toLowerCase().replace(/\s+/g, '_');
  if (PARTY_SLUG_LABELS[k]) return PARTY_SLUG_LABELS[k];
  return titleCaseSlug(String(slug));
}

/**
 * @param {string} raw
 * @returns {string}
 */
function titleCaseSlug(raw) {
  return raw
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** @type {Record<string, string>} */
const ELECTION_TYPE_LABELS = {
  house: 'House',
  senate: 'Senate',
  senate_class_1: 'Senate',
  senate_class_2: 'Senate',
  senate_class_3: 'Senate',
  presidential: 'Presidential',
  presidentialprimary: 'Presidential primary',
  primary: 'Primary',
  general: 'General',
  commons: 'Commons',
  lords: 'Lords',
  bundestag: 'Bundestag',
  bundesrat: 'Bundesrat',
  state: 'State',
  governor: 'Governor',
  local: 'Local',
};

/**
 * @param {string} t
 * @returns {string}
 */
function electionTypeLabel(t) {
  if (t == null || t === '') return '';
  const k = String(t).toLowerCase().replace(/\s+/g, '_');
  if (ELECTION_TYPE_LABELS[k]) return ELECTION_TYPE_LABELS[k];
  return titleCaseSlug(String(t));
}

/** @type {Record<string, string>} */
const CORP_TYPE_LABELS = {
  energy: 'Energy',
  oil: 'Oil & gas',
  tech: 'Technology',
  technology: 'Technology',
  steel: 'Steel',
  grain: 'Agriculture',
  manufacturing: 'Manufacturing',
  finance: 'Finance',
  media: 'Media',
  defense: 'Defense',
  healthcare: 'Healthcare',
  retail: 'Retail',
  transport: 'Transport',
  commodity: 'Commodities',
};

/**
 * @param {string} t
 * @returns {string}
 */
function corpTypeLabel(t) {
  if (t == null || t === '') return '';
  const k = String(t).toLowerCase().replace(/\s+/g, '_');
  if (CORP_TYPE_LABELS[k]) return CORP_TYPE_LABELS[k];
  return titleCaseSlug(String(t));
}

/** @type {Record<string, string>} */
const COMMODITY_ICONS = {
  oil: '🛢️',
  steel: '⚙️',
  tech: '💻',
  technology: '💻',
  grain: '🌾',
  energy: '⚡',
  manufacturing: '🏭',
  finance: '🏦',
  default: '📦',
};

/**
 * @param {string} type
 * @returns {string}
 */
function commodityIcon(type) {
  if (!type) return COMMODITY_ICONS.default;
  const k = String(type).toLowerCase();
  return COMMODITY_ICONS[k] || COMMODITY_ICONS.default;
}

/** @type {Record<string, string>} */
const COUNTRY_FLAGS = {
  US: '🇺🇸',
  USA: '🇺🇸',
  UK: '🇬🇧',
  GB: '🇬🇧',
  CA: '🇨🇦',
  CAN: '🇨🇦',
  DE: '🇩🇪',
  GER: '🇩🇪',
};

/**
 * @param {string} id
 * @returns {string}
 */
function countryFlagEmoji(id) {
  if (!id) return '';
  const k = String(id).toUpperCase();
  return COUNTRY_FLAGS[k] || '';
}

/**
 * @param {number} diffMs
 * @returns {string}
 */
function formatCountdownMs(diffMs) {
  const diff = Number(diffMs);
  if (!Number.isFinite(diff)) return '—';
  if (diff <= 0) return 'Ended';
  if (diff < 60_000) return '< 1m';
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (d >= 1) {
    const remH = Math.floor((diff % 86_400_000) / 3_600_000);
    return `${d}d ${remH}h`;
  }
  if (h >= 1) {
    const remM = Math.floor((diff % 3_600_000) / 60_000);
    return `${h}h ${remM}m`;
  }
  return `${m}m`;
}

/**
 * @param {string|number|Date} isoOrDate
 * @returns {string}
 */
function formatCountdownTo(isoOrDate) {
  if (isoOrDate == null || isoOrDate === '') return '—';
  try {
    const t = new Date(isoOrDate).getTime();
    if (Number.isNaN(t)) return '—';
    return formatCountdownMs(t - Date.now());
  } catch {
    return '—';
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.partyLabel = partyLabel;
  globalThis.electionTypeLabel = electionTypeLabel;
  globalThis.corpTypeLabel = corpTypeLabel;
  globalThis.commodityIcon = commodityIcon;
  globalThis.countryFlagEmoji = countryFlagEmoji;
  globalThis.formatCountdownMs = formatCountdownMs;
  globalThis.formatCountdownTo = formatCountdownTo;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    partyLabel,
    electionTypeLabel,
    corpTypeLabel,
    commodityIcon,
    countryFlagEmoji,
    titleCaseSlug,
    formatCountdownMs,
    formatCountdownTo,
  };
}
