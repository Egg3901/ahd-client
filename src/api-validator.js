'use strict';

/**
 * Validates API response shapes for all endpoints the client consumes.
 *
 * Each validator returns { valid: boolean, errors: string[] }.
 * Validators are intentionally permissive about optional fields — they only
 * flag structural problems that would break client logic (missing required
 * fields, wrong types on critical paths).
 *
 * SSE event validation mirrors the guard in the API integration spec:
 *   docs/api-specification/client-integration.md
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function result(errors) {
  return { valid: errors.length === 0, errors };
}

// ── /api/client-nav ───────────────────────────────────────────────────────────

/**
 * Required fields for a usable client-nav manifest.
 * All other fields (funds, actions, cashOnHand, etc.) are optional —
 * the client already guards for null values.
 */
const CLIENT_NAV_REQUIRED = [
  { field: 'hasCharacter', type: 'boolean' },
];

/**
 * Validate a /api/client-nav response body.
 * @param {unknown} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateClientNav(data) {
  const errors = [];

  if (!isObject(data)) {
    return result(['client-nav response is not an object']);
  }

  // user is either null or an object with username
  if (data.user !== null && data.user !== undefined) {
    if (!isObject(data.user)) {
      errors.push('client-nav.user must be an object or null');
    } else if (typeof data.user.username !== 'string') {
      errors.push('client-nav.user.username must be a string');
    }
  }

  for (const { field, type } of CLIENT_NAV_REQUIRED) {
    if (!(field in data)) {
      errors.push(`client-nav missing required field: ${field}`);
    } else if (typeof data[field] !== type) {
      errors.push(`client-nav.${field} expected ${type}, got ${typeof data[field]}`);
    }
  }

  // unreadCount must be a number when present
  if ('unreadCount' in data && typeof data.unreadCount !== 'number') {
    errors.push('client-nav.unreadCount must be a number');
  }

  return result(errors);
}

// ── /api/events (SSE) ─────────────────────────────────────────────────────────

const KNOWN_SSE_TYPES = new Set([
  'turn_complete',
  'election_resolved',
  'bill_enacted',
  'theme_changed',
]);

/**
 * Validate a parsed SSE event object.
 * Mirrors the validateSSEEvent guard from the API integration spec.
 * @param {unknown} event
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSSEEvent(event) {
  const errors = [];

  if (!isObject(event)) {
    return result(['SSE event is not an object']);
  }

  if (!('type' in event) || typeof event.type !== 'string') {
    errors.push('SSE event missing required string field: type');
  }

  if (!('payload' in event) && !('data' in event)) {
    errors.push('SSE event missing payload/data field');
  }

  if (!('timestamp' in event)) {
    errors.push('SSE event missing required field: timestamp');
  }

  if (errors.length === 0 && !KNOWN_SSE_TYPES.has(event.type)) {
    // Unknown type is a warning, not an error — server may add new types
    errors.push(`SSE event type unknown: ${event.type}`);
    return { valid: true, errors }; // valid but with informational warning
  }

  return result(errors);
}

// ── /api/error-codes ─────────────────────────────────────────────────────────

/**
 * Validate a /api/error-codes catalog response.
 * @param {unknown} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateErrorCatalog(data) {
  const errors = [];

  if (!isObject(data)) {
    return result(['error-codes response is not an object']);
  }

  if (!('errors' in data) || !Array.isArray(data.errors)) {
    errors.push('error-codes response missing errors array');
  } else {
    for (let i = 0; i < data.errors.length; i++) {
      const entry = data.errors[i];
      if (!isObject(entry)) {
        errors.push(`error-codes.errors[${i}] is not an object`);
        continue;
      }
      if (typeof entry.code !== 'string') {
        errors.push(`error-codes.errors[${i}] missing string field: code`);
      }
      if (typeof entry.message !== 'string') {
        errors.push(`error-codes.errors[${i}] missing string field: message`);
      }
    }
  }

  return result(errors);
}

// ── /api/settings/theme (PATCH response) ─────────────────────────────────────

/**
 * Validate a PATCH /api/settings/theme response.
 * @param {unknown} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateThemePatchResponse(data) {
  const errors = [];
  if (!isObject(data)) {
    return result(['theme PATCH response is not an object']);
  }
  if (data.success !== true) {
    errors.push('theme PATCH response did not return success:true');
  }
  return result(errors);
}

module.exports = {
  validateClientNav,
  validateSSEEvent,
  validateErrorCatalog,
  validateThemePatchResponse,
};
