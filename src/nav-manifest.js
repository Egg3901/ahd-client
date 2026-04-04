'use strict';

/**
 * Normalize /api/client-nav field names for a single internal shape.
 * @param {object} manifest
 * @returns {object}
 */
function normalizeClientNavManifest(manifest) {
  const characterCountryId =
    manifest.characterCountryId ?? manifest.character_countryId ?? null;
  return { ...manifest, characterCountryId };
}

module.exports = { normalizeClientNavManifest };
