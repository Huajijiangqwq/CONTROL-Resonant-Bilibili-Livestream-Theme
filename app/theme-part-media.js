/* Image content is composited inside the native message pass. */
(() => {
  'use strict';
  const cache = new Map(),
    clamp = (x) => Math.max(0, Math.min(1, x));
  let revision = 0;
  function safe(src) {
    if (/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(src)) return true;
    try {
      const u = new URL(src, location.href);
      return !!src && ['http:', 'https:'].includes(u.protocol);
    } catch {
      return false;
    }
  }
  function load(src) {
    if (!safe(src)) return null;
    if (cache.has(src)) {
      const hit = cache.get(src);
      hit.usedAt = performance.now();
      return hit;
    }
    const entry = { image: new Image(), state: 'loading', usedAt: performance.now() };
    entry.image.crossOrigin = 'anonymous';
    entry.image.onload = () => {
      entry.state = 'ready';
      revision++;
      window.dispatchEvent(new CustomEvent('theme-part-media-ready'));
    };
    entry.image.onerror = () => {
      entry.state = 'error';
      revision++;
      window.dispatchEvent(new CustomEvent('theme-part-media-ready'));
    };
    entry.image.src = src;
    cache.set(src, entry);
    if (cache.size > 48) {
      for (const [key, value] of cache) {
        if (value.state !== 'loading' && key !== src && entry.usedAt - value.usedAt > 30000) {
          cache.delete(key);
          if (cache.size <= 48) break;
        }
      }
    }
    return entry;
  }
  function draw(c, p, age = 1000, mode = p.imageMode || 'reveal') {
    const entry = load(p.src);
    if (!entry) return;
    const t = mode === 'evidence' ? Math.floor(Math.max(0, age) / 55) * 55 : age,
      start = mode === 'evidence' ? 90 : 45,
      end = mode === 'evidence' ? 595 : 220,
      amount = clamp((t - start) / (end - start));
    if (amount <= 0) return;
    c.save();
    c.beginPath();
    c.rect(p.x, p.y, p.w, p.h);
    c.clip();
    if (entry.state !== 'ready') {
      c.strokeStyle = entry.state === 'error' ? '#b87166' : '#77897e';
      c.lineWidth = 1;
      c.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
      c.beginPath();
      c.moveTo(p.x + 1, p.y + p.h - 1);
      c.lineTo(p.x + p.w - 1, p.y + 1);
      c.stroke();
      c.restore();
      return;
    }
    const im = entry.image,
      ratio = mode === 'plain' ? 1 : amount,
      iw = im.naturalWidth,
      ih = im.naturalHeight;
    let w = p.w,
      h = p.h,
      x = p.x,
      y = p.y;
    if (p.fit !== 'fill') {
      const scale = p.fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
      w = iw * scale;
      h = ih * scale;
      x += (p.w - w) / 2;
      y += (p.h - h) / 2;
    }
    if (mode === 'reveal') {
      const reveal = 1 - Math.pow(1 - ratio, 3);
      c.beginPath();
      c.rect(p.x, p.y, p.w * reveal, p.h);
      c.clip();
    }
    const gray = mode === 'evidence' ? 1 : (p.grayscale ?? 0),
      soft = mode === 'evidence' ? (1 - ratio) ** 2 * 5 : 0,
      brightness = mode === 'evidence' ? 0.3 + ratio * 0.7 : 1;
    c.filter = `grayscale(${gray}) blur(${soft}px) brightness(${brightness})`;
    c.drawImage(im, x, y, w, h);
    c.restore();
  }
  window.ThemePartMedia = {
    draw,
    load,
    get cacheSize() {
      return cache.size;
    },
    get revision() {
      return revision;
    },
  };
})();
