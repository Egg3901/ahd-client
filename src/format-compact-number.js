'use strict';

/**
 * Compact positive integer for suffix display (k / m / b), e.g. 130190 → "130.19k".
 * @param {number} absInt - non-negative integer
 * @returns {string}
 */
function formatCompactAbs(absInt) {
  const x = Math.abs(Math.trunc(Number(absInt)));
  if (Number.isNaN(x)) return '0';
  if (x < 1000) return String(x);

  let divisor;
  let suffix;
  if (x >= 1e9) {
    divisor = 1e9;
    suffix = 'b';
  } else if (x >= 1e6) {
    divisor = 1e6;
    suffix = 'm';
  } else {
    divisor = 1e3;
    suffix = 'k';
  }

  const d = x / divisor;
  let str;
  if (suffix === 'k') {
    str = d.toFixed(2);
  } else {
    if (d >= 100) str = d.toFixed(0);
    else if (d >= 10) str = d.toFixed(1);
    else str = d.toFixed(2);
  }
  str = str.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return str + suffix;
}

/**
 * Rounded dollar amount with compact suffixes ($130.19k, $140m) instead of locale groups.
 * @param {unknown} n
 * @returns {string}
 */
function formatMoneyCompact(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const r = Math.round(Number(n));
  const neg = r < 0;
  const body = formatCompactAbs(Math.abs(r));
  return (neg ? '-$' : '$') + body;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatCompactAbs, formatMoneyCompact };
}

if (typeof globalThis !== 'undefined') {
  globalThis.formatCompactAbs = formatCompactAbs;
  globalThis.formatMoneyCompact = formatMoneyCompact;
}
