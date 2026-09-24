/* Preserve authored media fitting and CSS box geometry during native VHS capture. */
(() => {
  'use strict';
  function mediaRect(sw, sh, w, h, fit = 'contain') {
    if (!sw || !sh || !w || !h) return null;
    if (fit === 'fill') return { sx: 0, sy: 0, sw, sh, dx: 0, dy: 0, dw: w, dh: h };
    const scale = (fit === 'cover' ? Math.max : Math.min)(w / sw, h / sh);
    if (fit === 'cover') {
      const cw = w / scale,
        ch = h / scale;
      return { sx: (sw - cw) / 2, sy: (sh - ch) / 2, sw: cw, sh: ch, dx: 0, dy: 0, dw: w, dh: h };
    }
    return {
      sx: 0,
      sy: 0,
      sw,
      sh,
      dx: (w - sw * scale) / 2,
      dy: (h - sh * scale) / 2,
      dw: sw * scale,
      dh: sh * scale,
    };
  }
  function media(c, el, l) {
    const video = el.tagName === 'VIDEO',
      image = el.tagName === 'IMG';
    if ((video && el.readyState < 2) || (image && (!el.complete || !el.naturalWidth))) return;
    const sw = video ? el.videoWidth : image ? el.naturalWidth : el.width,
      sh = video ? el.videoHeight : image ? el.naturalHeight : el.height;
    const r = mediaRect(sw, sh, l.w, l.h, image || video ? l.fit : 'fill');
    if (!r) return;
    try {
      c.drawImage(el, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
    } catch {}
  }
  function shape(c, l) {
    const w = l.w,
      h = l.h,
      r = Math.max(0, Math.min(l.radius, w / 2, h / 2)),
      s = Math.min(l.strokeWidth, w / 2, h / 2);
    c.fillStyle = l.fill;
    c.beginPath();
    c.roundRect(0, 0, w, h, r);
    c.fill();
    if (!s) return;
    c.strokeStyle = l.stroke;
    const ring = (inset, width) => {
      c.lineWidth = width;
      c.beginPath();
      c.roundRect(
        inset,
        inset,
        Math.max(0, w - 2 * inset),
        Math.max(0, h - 2 * inset),
        Math.max(0, r - inset),
      );
      c.stroke();
    };
    if (l.borderStyle === 'double' && s >= 3) {
      ring(s / 6, s / 3);
      ring((s * 5) / 6, s / 3);
    } else {
      if (l.borderStyle === 'dashed') c.setLineDash([s * 3, s * 3]);
      ring(s / 2, s);
      c.setLineDash([]);
    }
  }
  function draw(c, el, l) {
    if (l.type === 'shape' || l.type === 'line') shape(c, l);
    else if (['IMG', 'VIDEO', 'CANVAS'].includes(el.tagName)) media(c, el, l);
  }
  window.ThemeDecorationPaint = { mediaRect, media, shape, draw };
})();
