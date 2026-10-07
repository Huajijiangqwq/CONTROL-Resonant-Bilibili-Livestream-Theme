/* Compare normalized JSON data without allocating serialized copies of media.
   Object key order is immaterial; omitted values match JSON.stringify semantics. */
(function (root) {
  'use strict';
  function scalar(value) {
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    return value;
  }
  function same(a, b) {
    a = scalar(a); b = scalar(b);
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const arrayA = Array.isArray(a), arrayB = Array.isArray(b);
    if (arrayA || arrayB) {
      if (!arrayA || !arrayB || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        const x = scalar(a[i]), y = scalar(b[i]);
        if (!same(x === undefined ? null : x, y === undefined ? null : y)) return false;
      }
      return true;
    }
    const keysA = Object.keys(a), keysB = Object.keys(b);
    let countA = 0, countB = 0;
    for (const key of keysA) {
      const value = scalar(a[key]);
      if (value === undefined) continue;
      countA++;
      if (!Object.hasOwn(b, key) || !same(value, b[key])) return false;
    }
    for (const key of keysB) if (scalar(b[key]) !== undefined) countB++;
    return countA === countB;
  }
  const api = { same };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeDocumentCompare = api;
})(globalThis);
