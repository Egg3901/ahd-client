'use strict';

const { resolveGamePath } = require('./game-paths');

/** Site path to open when the player is not a CEO (create / join corporation flow). */
const CREATE_CORPORATION_PATH = '/corporation/create';

/**
 * Game menu quick links (Profile, Campaign HQ, …) with CEO vs Create a corporation and custom URLs.
 * @typedef {{ kind: 'preset', id: string }} GamePanelPresetEntry
 * @typedef {{ kind: 'custom', label: string, path: string }} GamePanelCustomEntry
 * @typedef {GamePanelPresetEntry | GamePanelCustomEntry} GamePanelEntry
 */

/** @type {{ id: string, label: string, accelerator?: string }[]} */
const PRESET_META = [
  { id: 'profile', label: 'Profile', accelerator: 'CmdOrCtrl+P' },
  { id: 'campaign', label: 'Campaign HQ', accelerator: 'CmdOrCtrl+Shift+C' },
  { id: 'notifications', label: 'Notifications', accelerator: 'CmdOrCtrl+N' },
  { id: 'portfolio', label: 'Portfolio' },
  {
    id: 'ceo',
    label: 'CEO / Create a corporation',
  },
];

const PRESET_ORDER = PRESET_META.map((p) => p.id);

const PRESET_ROUTES = {
  profile: () => '/profile',
  campaign: (m) =>
    m.campaignId != null ? `/campaign/${m.campaignId}` : '/campaign',
  notifications: () => '/notifications',
  portfolio: () => '/portfolio',
  ceo: (m) => {
    if (m.isCeo && m.myCorporationId != null) {
      return `/corporation/${m.myCorporationId}/ceo`;
    }
    return CREATE_CORPORATION_PATH;
  },
};

/**
 * Whether a preset should appear when using automatic defaults (stored entries is null).
 * @param {string} id
 * @param {object} manifest
 */
function defaultPresetVisible(_id, _manifest) {
  return true;
}

/**
 * Whether a preset can resolve to a navigable path for the current manifest.
 * @param {string} id
 * @param {object} manifest
 */
function presetIsAvailable(id, manifest) {
  const route = resolvePresetRoute(id, manifest);
  return route != null;
}

/**
 * @param {string} id
 * @param {object} manifest
 * @returns {string|null}
 */
function resolvePresetRoute(id, manifest) {
  const fn = PRESET_ROUTES[id];
  if (!fn) return null;
  const route = fn(manifest);
  if (route == null) return null;
  try {
    return resolveGamePath(route);
  } catch {
    return null;
  }
}

/**
 * Build default entry list when the user has not customized (null storage).
 * @param {object} manifest
 * @returns {GamePanelEntry[]}
 */
function buildDefaultEntries(manifest) {
  /** @type {GamePanelEntry[]} */
  const out = [];
  for (const id of PRESET_ORDER) {
    if (!defaultPresetVisible(id, manifest)) continue;
    if (!presetIsAvailable(id, manifest)) continue;
    out.push({ kind: 'preset', id });
  }
  return out;
}

/**
 * @param {GamePanelEntry[]|null|undefined} stored
 * @param {object} manifest
 * @returns {GamePanelEntry[]}
 */
function resolveEffectiveEntries(stored, manifest) {
  if (stored == null || !Array.isArray(stored)) {
    return buildDefaultEntries(manifest);
  }
  return stored;
}

/**
 * @param {string} path
 * @returns {string|null}
 */
function validateCustomPath(path) {
  const raw = String(path || '').trim();
  if (!raw.startsWith('/')) return null;
  if (raw.includes('..')) return null;
  const noQuery = raw.split('?')[0];
  if (/\s/.test(noQuery)) return null;
  try {
    return resolveGamePath(raw);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} entry
 * @returns {entry is GamePanelEntry}
 */
function isValidEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const k = entry.kind;
  if (k === 'preset') {
    return typeof entry.id === 'string' && PRESET_ORDER.includes(entry.id);
  }
  if (k === 'custom') {
    return (
      typeof entry.label === 'string' &&
      entry.label.trim().length > 0 &&
      typeof entry.path === 'string' &&
      validateCustomPath(entry.path) != null
    );
  }
  return false;
}

/**
 * @param {unknown} entries
 * @returns {GamePanelEntry[]|null} null if invalid
 */
function normalizeStoredEntries(entries) {
  if (entries == null) return null;
  if (!Array.isArray(entries)) return null;
  const out = [];
  for (const e of entries) {
    if (!isValidEntry(e)) return null;
    if (e.kind === 'custom') {
      out.push({
        kind: 'custom',
        label: e.label.trim(),
        path: validateCustomPath(e.path),
      });
    } else {
      out.push({ kind: 'preset', id: e.id });
    }
  }
  return out;
}

/**
 * @param {GamePanelEntry} entry
 * @param {object} manifest
 * @returns {{ label: string, route: string, accelerator?: string }|null}
 */
function resolveEntryForMenu(entry, manifest) {
  if (entry.kind === 'custom') {
    const route = validateCustomPath(entry.path);
    if (!route) return null;
    return { label: entry.label.trim(), route };
  }
  const meta = PRESET_META.find((p) => p.id === entry.id);
  if (!meta) return null;
  const route = resolvePresetRoute(entry.id, manifest);
  if (!route) return null;
  let label = meta.label;
  if (entry.id === 'ceo') {
    label =
      manifest.isCeo && manifest.myCorporationId != null
        ? 'CEO'
        : 'Create a corporation';
  }
  return {
    label,
    route,
    accelerator: meta.accelerator,
  };
}

/**
 * Build Electron menu template objects for the Game menu quick-link block.
 * @param {object} manifest
 * @param {GamePanelEntry[]|null|undefined} stored
 * @param {(route: string) => void} navigate
 */
function buildGamePanelMenuTemplate(manifest, stored, navigate) {
  const effective = resolveEffectiveEntries(stored, manifest);
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const items = [];
  for (const entry of effective) {
    const resolved = resolveEntryForMenu(entry, manifest);
    if (!resolved) continue;
    /** @type {Electron.MenuItemConstructorOptions} */
    const opt = {
      label: resolved.label,
      click: () => navigate(resolved.route),
    };
    if (resolved.accelerator) opt.accelerator = resolved.accelerator;
    items.push(opt);
  }
  return items;
}

/**
 * Static catalog for the config window (checkbox list + metadata).
 */
function getGamePanelCatalog() {
  return PRESET_META.map((p) => ({ ...p }));
}

module.exports = {
  PRESET_ORDER,
  CREATE_CORPORATION_PATH,
  buildDefaultEntries,
  resolveEffectiveEntries,
  buildGamePanelMenuTemplate,
  getGamePanelCatalog,
  validateCustomPath,
  normalizeStoredEntries,
  defaultPresetVisible,
  presetIsAvailable,
  resolvePresetRoute,
};
