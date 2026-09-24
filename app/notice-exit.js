/* Composite each animated group after its renderer has applied material alpha.
   Drawing directly with globalAlpha would miss the ink and light passes. */
(() => {
  'use strict';
  const smooth = NoticeLifetime.ease,
    caches = new WeakMap();
  function surface(context, key, w, h) {
    let entry = caches.get(context);
    if (!entry) {
      entry = {};
      caches.set(context, entry);
    }
    let s = entry[key];
    if (!s) {
      const canvas = document.createElement('canvas');
      s = entry[key] = { canvas, c: canvas.getContext('2d') };
    }
    w = Math.ceil(w);
    h = Math.ceil(h);
    if (s.canvas.width !== w || s.canvas.height !== h) {
      s.canvas.width = w;
      s.canvas.height = h;
    }
    s.c.setTransform(1, 0, 0, 1, 0, 0);
    s.c.clearRect(0, 0, w, h);
    return s;
  }
  const gift = GiftNotice.draw;
  GiftNotice.draw = function (c, o) {
    const p = o.exitProgress ?? -1;
    if (p < 0) {
      gift(c, o);
      return;
    }
    if (p >= 1) return;
    const q = Math.min(2, Math.max(1, c.getTransform().a || 1));
    let left = 0,
      top = 0,
      right = o.width + 4,
      bottom = GiftNotice.height(o.width, o.data, o.main, o.compact, o.style) + 6;
    if (o.style?.parts?.length) {
      const model = GiftNotice.responsiveModel(o.width, o.data, o.style);
      for (const part of model.parts) {
        if (!part.visible) continue;
        const m = window.ThemeKeyframes?.part(part, o.motionTime ?? o.age, o.motionExit) || {
          dx: 0,
          dy: 0,
        };
        left = Math.min(left, part.x + m.dx - 3);
        top = Math.min(top, part.y + m.dy - 3);
        right = Math.max(right, part.x + m.dx + part.w + 3);
        bottom = Math.max(bottom, part.y + m.dy + part.h + 3);
      }
    }
    const s = surface(c, 'gift', (right - left) * q, (bottom - top) * q);
    s.c.scale(q, q);
    gift(s.c, { ...o, x: -left, y: -top });
    c.save();
    c.globalAlpha *= 1 - smooth(p);
    c.drawImage(s.canvas, o.x + left, o.y + top, s.canvas.width / q, s.canvas.height / q);
    c.restore();
  };
})();
