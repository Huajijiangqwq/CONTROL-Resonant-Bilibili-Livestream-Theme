/* Non-destructive source cropping, shared by DOM media and recorded chat FX. */
(function (root) {
  'use strict';
  const sides = ['Left', 'Top', 'Right', 'Bottom'];
  function normalize(raw = {}) {
    const out = {};
    for (const side of sides) {
      const value = Number(raw['crop' + side]);
      out['crop' + side] = Number.isFinite(value) ? Math.max(0, Math.min(95, value)) : 0;
    }
    for (const [a, b] of [['Left', 'Right'], ['Top', 'Bottom']]) {
      const sum = out['crop' + a] + out['crop' + b];
      if (sum > 95) { out['crop' + a] *= 95 / sum; out['crop' + b] *= 95 / sum; }
    }
    return out;
  }
  const enabled = l => ['image', 'video'].includes(l?.type) || l?.type === 'background' && ['image', 'video'].includes(l.mode);
  function rect(sw, sh, w, h, fit = 'contain', raw = {}) {
    if (![sw, sh, w, h].every(v => Number.isFinite(v) && v > 0)) return null;
    const crop = normalize(raw);
    let sx = sw * crop.cropLeft / 100, sy = sh * crop.cropTop / 100,
      cw = sw * (1 - (crop.cropLeft + crop.cropRight) / 100),
      ch = sh * (1 - (crop.cropTop + crop.cropBottom) / 100);
    if (fit === 'fill') return { sx, sy, sw: cw, sh: ch, dx: 0, dy: 0, dw: w, dh: h };
    const scale = (fit === 'cover' ? Math.max : Math.min)(w / cw, h / ch);
    if (fit === 'cover') {
      const visibleW = w / scale, visibleH = h / scale;
      sx += (cw - visibleW) / 2; sy += (ch - visibleH) / 2;
      return { sx, sy, sw: visibleW, sh: visibleH, dx: 0, dy: 0, dw: w, dh: h };
    }
    return { sx, sy, sw: cw, sh: ch, dx: (w - cw * scale) / 2,
      dy: (h - ch * scale) / 2, dw: cw * scale, dh: ch * scale };
  }
  function style(sw, sh, w, h, fit, raw) {
    const r = rect(sw, sh, w, h, fit, raw);
    if (!r) return null;
    const scaleX = r.dw / r.sw, scaleY = r.dh / r.sh;
    return { left: r.dx - r.sx * scaleX, top: r.dy - r.sy * scaleY,
      width: sw * scaleX, height: sh * scaleY };
  }
  const api = { sides, normalize, enabled, rect, style };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeMediaCrop = api;
})(globalThis);
