/* Mirror the printed chat surface under the whole-panel fleet post-process. */
(() => {
  'use strict';
  const patterns = new WeakMap();
  function pattern(c) {
    const tile = window.LiveMaterial?.panelTexture;
    if (!tile) return null;
    let item = patterns.get(c);
    if (!item || item.tile !== tile) {
      item = { tile, paint: c.createPattern(tile, 'repeat') };
      patterns.set(c, item);
    }
    return item.paint;
  }
  function parts(text) {
    const result = [];
    let depth = 0,
      from = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      else if (text[i] === ',' && !depth) {
        result.push(text.slice(from, i).trim());
        from = i + 1;
      }
    }
    result.push(text.slice(from).trim());
    return result;
  }
  function clip(c, style, r) {
    const match = /^inset\(([^)]+)\)$/.exec(style.clipPath || '');
    if (!match) return;
    const values = match[1].split(/\s+/);
    if (values.some((v) => !/^[-\d.]+(?:px|%)?$/.test(v))) return;
    const edges = [
      values[0],
      values[1] || values[0],
      values[2] || values[0],
      values[3] || values[1] || values[0],
    ].map((v, i) => parseFloat(v) * (v.endsWith('%') ? (i % 2 ? r.w : r.h) / 100 : 1));
    c.beginPath();
    c.rect(
      r.x + edges[3],
      r.y + edges[0],
      Math.max(0, r.w - edges[1] - edges[3]),
      Math.max(0, r.h - edges[0] - edges[2]),
    );
    c.clip();
  }
  function background(c, style, r) {
    c.fillStyle = style.backgroundColor;
    c.fillRect(r.x, r.y, r.w, r.h);
    const match = /^linear-gradient\((.*)\)$/.exec(style.backgroundImage || '');
    if (!match) return;
    const args = parts(match[1]),
      direction = args.shift(),
      angle = direction.endsWith('deg') ? (parseFloat(direction) * Math.PI) / 180 : Math.PI / 2;
    const length = Math.abs(Math.sin(angle) * r.w) + Math.abs(Math.cos(angle) * r.h),
      dx = (Math.sin(angle) * length) / 2,
      dy = (-Math.cos(angle) * length) / 2;
    const gradient = c.createLinearGradient(
      r.x + r.w / 2 - dx,
      r.y + r.h / 2 - dy,
      r.x + r.w / 2 + dx,
      r.y + r.h / 2 + dy,
    );
    const stops = args.map((value) => {
      const stop = /^(.*)\s+([\d.]+)%$/.exec(value);
      return stop ? { color: stop[1], at: +stop[2] / 100 } : { color: value, at: null };
    });
    if (!stops.length) return;
    if (stops[0].at === null) stops[0].at = 0;
    if (stops.at(-1).at === null) stops.at(-1).at = 1;
    for (let i = 1; i < stops.length - 1; i++)
      if (stops[i].at === null) {
        let end = i + 1;
        while (stops[end].at === null) end++;
        const begin = stops[i - 1].at;
        for (let j = i; j < end; j++)
          stops[j].at = begin + ((stops[end].at - begin) * (j - i + 1)) / (end - i + 1);
        i = end - 1;
      }
    for (const stop of stops) gradient.addColorStop(Math.max(0, Math.min(1, stop.at)), stop.color);
    c.fillStyle = gradient;
    c.fillRect(r.x, r.y, r.w, r.h);
  }
  function surface(c, panel, w, h) {
    const style = getComputedStyle(panel);
    background(c, style, { x: 0, y: 0, w, h });
    const paint = pattern(c);
    if (paint && style.backgroundImage.includes('url(')) {
      c.fillStyle = paint;
      c.fillRect(0, 0, w, h);
    }
    const front = getComputedStyle(panel, '::before');
    if (paint && front.content !== 'none' && front.backgroundImage.includes('url(')) {
      c.save();
      c.globalAlpha = Number(front.opacity);
      c.fillStyle = paint;
      c.fillRect(0, 0, w, h);
      c.restore();
    }
    // Existing one-pixel inset print edges, inside the panel border.
    if (style.boxShadow !== 'none') {
      c.save();
      c.globalAlpha *= Number(style.getPropertyValue('--panel-base-opacity') || 1);
      c.fillStyle = '#d9dec512';
      c.fillRect(0, 0, 1, h);
      c.fillStyle = '#0008';
      c.fillRect(w - 1, 0, 1, h);
      c.restore();
    }
  }
  function feed(c, element, r) {
    const style = getComputedStyle(element, '::after'),
      paint = pattern(c);
    if (
      !paint ||
      style.content === 'none' ||
      style.display === 'none' ||
      !style.backgroundImage.includes('url(')
    )
      return;
    c.save();
    c.globalAlpha = Number(style.opacity);
    c.translate(r.x, r.y);
    c.fillStyle = paint;
    c.fillRect(0, 0, r.w, r.h);
    c.restore();
  }
  function fields(c, panel, rect) {
    const scene = panel.closest('.scene');
    if (!scene) return;
    for (const field of scene.querySelectorAll('.resonance-field')) {
      const style = getComputedStyle(field);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        !field.width ||
        !field.height
      )
        continue;
      const r = rect(field);
      c.save();
      c.globalAlpha = Number(style.opacity);
      c.drawImage(field, r.x, r.y, r.w, r.h);
      c.restore();
    }
  }
  window.FleetPanelSurface = { background, surface, feed, fields, clip };
})();
