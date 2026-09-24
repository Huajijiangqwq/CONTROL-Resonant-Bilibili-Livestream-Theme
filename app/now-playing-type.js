(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NowPlayingType = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const graphemes = (text) =>
    typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(
          (p) => p.segment,
        )
      : Array.from(text);
  function style(text) {
    const fallback = 'NPDisplay,NPCondensed,NPCJK,NPArabic,NPHebrew,NPDevanagari,NPThai,sans-serif';
    if (/[\u0600-\u08ff]/u.test(text))
      return {
        family: 'NPArabic,NPCondensed,NPCJK,sans-serif',
        weight: 800,
        rtl: true,
        label: 'Noto Sans Arabic',
      };
    if (/[\u0590-\u05ff]/u.test(text))
      return {
        family: 'NPHebrew,NPCondensed,NPCJK,sans-serif',
        weight: 800,
        rtl: true,
        label: 'Noto Sans Hebrew',
      };
    if (/[\u0900-\u097f]/u.test(text))
      return {
        family: 'NPDevanagari,NPCondensed,NPCJK,sans-serif',
        weight: 800,
        rtl: false,
        label: 'Noto Sans Devanagari',
      };
    if (/[\u0e00-\u0e7f]/u.test(text))
      return {
        family: 'NPThai,NPCondensed,NPCJK,sans-serif',
        weight: 800,
        rtl: false,
        label: 'Noto Sans Thai',
      };
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/u.test(text))
      return {
        family: 'NPCJK,NPCondensed,sans-serif',
        weight: 900,
        rtl: false,
        label: 'Noto Sans CJK Black',
      };
    if (/[\u0370-\u052f]/u.test(text))
      return {
        family: 'NPCondensed,NPCJK,sans-serif',
        weight: 900,
        rtl: false,
        label: 'Roboto Condensed',
      };
    return { family: fallback, weight: 400, rtl: false, label: 'Anton' };
  }
  const font = (spec, size) => spec.weight + ' ' + size + 'px ' + spec.family;
  function linesFor(text, maxWidth, measure) {
    const tokens =
      typeof Intl.Segmenter === 'function'
        ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].map(
            (t) => t.segment,
          )
        : graphemes(text);
    const lines = [];
    let line = '';
    for (const token of tokens) {
      if (measure(line + token) <= maxWidth) {
        line += token;
        continue;
      }
      if (line.trim()) {
        lines.push(line.trim());
        line = '';
      }
      if (measure(token) <= maxWidth) {
        line = token.trimStart();
        continue;
      }
      for (const cluster of graphemes(token)) {
        if (line && measure(line + cluster) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += cluster;
      }
    }
    if (line.trim()) lines.push(line.trim());
    return lines.length ? lines : [''];
  }
  function layout(ctx, text, { width, height, maxSize = 238, minSize = 76, maxLines = 2 } = {}) {
    const spec = style(text);
    text = String(text).replace(/\s+/g, ' ').trim();
    function attempt(size, wrap) {
      ctx.font = font(spec, size);
      ctx.textBaseline = 'alphabetic';
      const measure = (value) => ctx.measureText(value).width;
      const lines = wrap ? linesFor(text, width, measure) : [text];
      const metrics = lines.map((line) => ctx.measureText(line || 'Ag'));
      const ascent = Math.max(...metrics.map((m) => m.actualBoundingBoxAscent ?? size * 0.82)),
        descent = Math.max(...metrics.map((m) => m.actualBoundingBoxDescent ?? size * 0.2)),
        lineHeight = size * 1.14,
        blockHeight = ascent + descent + (lines.length - 1) * lineHeight;
      return {
        lines,
        size,
        spec,
        ascent,
        descent,
        lineHeight,
        blockHeight,
        truncated: false,
        fits:
          lines.length <= maxLines &&
          blockHeight <= height &&
          metrics.every((m) => m.width <= width + 0.01),
      };
    }
    // Keep a single line only while its natural font size stays readable; never scale glyphs in X.
    const singleFloor = Math.max(minSize, maxSize * 0.62);
    for (let size = maxSize; size >= singleFloor; size -= 2) {
      const result = attempt(size, false);
      if (result.fits) return result;
    }
    for (let size = Math.min(maxSize, Math.floor(height / 0.98)); size >= minSize; size -= 2) {
      const result = attempt(size, true);
      if (result.fits) return result;
    }
    const result = attempt(minSize, true);
    result.lines = result.lines.slice(0, maxLines);
    result.truncated = true;
    ctx.font = font(spec, minSize);
    let tail = graphemes(result.lines.at(-1) || '');
    while (tail.length && ctx.measureText(tail.join('') + '…').width > width) tail.pop();
    result.lines[result.lines.length - 1] = tail.join('') + '…';
    result.blockHeight =
      result.ascent + result.descent + (result.lines.length - 1) * result.lineHeight;
    return result;
  }
  function draw(ctx, result, { x, y, width, height, color = '#edeadd' }) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 2, y - 2, width + 4, height + 4);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.font = font(result.spec, result.size);
    ctx.direction = result.spec.rtl ? 'rtl' : 'ltr';
    ctx.textAlign = result.spec.rtl ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    const baseline = y + Math.max(0, (height - result.blockHeight) / 2) + result.ascent;
    for (let i = 0; i < result.lines.length; i++)
      ctx.fillText(
        result.lines[i],
        result.spec.rtl ? x + width : x,
        baseline + i * result.lineHeight,
      );
    ctx.restore();
  }
  return { graphemes, style, font, linesFor, layout, draw };
});
