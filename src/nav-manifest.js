'use strict';

/**
 * Resolve whether the signed-in user has an active playable character.
 * The site historically sent `hasCharacter`; newer payloads may omit it but
 * still include `homeState`, `adminCharacters`, or a nested `character`.
 * @param {object} m
 * @returns {boolean}
 */
function deriveHasCharacter(m) {
  if (m.hasCharacter === false || m.has_character === false) return false;
  if (m.hasCharacter === true || m.has_character === true) return true;
  if (m.character != null && typeof m.character === 'object') return true;
  if (m.homeState != null && typeof m.homeState === 'object') return true;
  if (Array.isArray(m.adminCharacters) && m.adminCharacters.length > 0)
    return true;
  return false;
}

/**
 * Normalize /api/client-nav field names for a single internal shape.
 * @param {object} manifest
 * @returns {object}
 */
function normalizeClientNavManifest(manifest) {
  const characterCountryId =
    manifest.characterCountryId ?? manifest.character_countryId ?? null;
  const hasCharacter = deriveHasCharacter(manifest);
  return { ...manifest, characterCountryId, hasCharacter };
}

module.exports = { normalizeClientNavManifest };
