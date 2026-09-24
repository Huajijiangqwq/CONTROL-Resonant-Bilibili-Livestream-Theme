/* Replace only the pixels currently being re-rendered by the fleet signal.
   A translucent panel must not be composited twice over the live game. */
(() => {
  'use strict';
  function create() {
    const originals = new Map();
    function clear() {
      for (const [el, style] of originals) {
        el.style.maskImage = style;
      }
      originals.clear();
    }
    function apply(entries, chat, region) {
      if (!chat) {
        clear();
        return;
      }
      const area = region || { x: 0, y: 0, w: chat.w, h: chat.h },
        left = Math.max(0, area.x),
        top = Math.max(0, area.y),
        right = Math.min(chat.w, area.x + area.w),
        bottom = Math.min(chat.h, area.y + area.h);
      if (right <= left || bottom <= top) {
        clear();
        return;
      }
      const live = new Set();
      for (const [el, l] of entries) {
        live.add(el);
        if (!originals.has(el)) originals.set(el, el.style.maskImage);
        const a = (-(l.rotation || 0) * Math.PI) / 180,
          cx = l.x + l.w / 2,
          cy = l.y + l.h / 2;
        const points = [
          [left, top],
          [right, top],
          [right, bottom],
          [left, bottom],
        ]
          .map(([x, y]) => {
            const dx = chat.x + x - cx,
              dy = chat.y + y - cy;
            return [
              l.w / 2 + dx * Math.cos(a) - dy * Math.sin(a),
              l.h / 2 + dx * Math.sin(a) + dy * Math.cos(a),
            ]
              .map((v) => v.toFixed(3))
              .join(',');
          })
          .join(' ');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${l.w}" height="${l.h}" viewBox="0 0 ${l.w} ${l.h}"><defs><mask id="cut"><rect width="100%" height="100%" fill="white"/><polygon points="${points}" fill="black"/></mask></defs><rect width="100%" height="100%" fill="white" mask="url(#cut)"/></svg>`;
        const value = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        if (el.style.maskImage !== value) el.style.maskImage = value;
      }
      for (const [el, style] of originals)
        if (!live.has(el)) {
          el.style.maskImage = style;
          originals.delete(el);
        }
    }
    return { apply, clear };
  }
  window.ThemePanelMask = { ...create(), create };
})();
