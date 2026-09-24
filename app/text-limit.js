(function (root) {
  'use strict';
  const segmenter =
    typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
      : null;
  // Keep the existing UTF-16 budgets, but never cut through a visible character.
  // Old drafts or an upstream truncation can already contain a lone surrogate.
  function take(value, max) {
    const text = String(value ?? '').replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      '',
    );
    const limit = Math.max(0, Math.floor(Number(max) || 0));
    if (text.length <= limit) return text;
    let end = 0;
    for (const part of segmenter ? segmenter.segment(text) : Array.from(text)) {
      const length = (segmenter ? part.segment : part).length;
      if (end + length > limit) break;
      end += length;
    }
    return text.slice(0, end);
  }
  const api = { take };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TextLimit = api;
})(typeof window === 'object' ? window : globalThis);
