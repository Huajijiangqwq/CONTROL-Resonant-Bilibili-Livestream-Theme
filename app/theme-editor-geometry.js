/* Selection and drag coordinates use the same rotation as native DOM layers. */
(function (root) {
  'use strict';
  function vector(x, y, degrees) {
    const a = (degrees * Math.PI) / 180;
    return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
  }
  function project(rect, parent) {
    const cx = parent.x + parent.w / 2,
      cy = parent.y + parent.h / 2,
      d = vector(rect.x + rect.w / 2 - cx, rect.y + rect.h / 2 - cy, parent.rotation || 0);
    return {
      ...rect,
      x: cx + d.x - rect.w / 2,
      y: cy + d.y - rect.h / 2,
      rotation: parent.rotation || 0,
    };
  }
  function point(rect, x, y) {
    const d = vector(x - rect.w / 2, y - rect.h / 2, rect.rotation || 0);
    return { x: rect.x + rect.w / 2 + d.x, y: rect.y + rect.h / 2 + d.y };
  }
  function visualBounds(rects) {
    const corners = rects.flatMap((r) =>
      [
        [0, 0],
        [r.w, 0],
        [r.w, r.h],
        [0, r.h],
      ].map(([x, y]) => point(r, x, y)),
    );
    if (!corners.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(...corners.map((p) => p.x)),
      y = Math.min(...corners.map((p) => p.y));
    return {
      x,
      y,
      w: Math.max(...corners.map((p) => p.x)) - x,
      h: Math.max(...corners.map((p) => p.y)) - y,
    };
  }
  function unprojectPoint(rect, p) {
    const d = vector(p.x - rect.x - rect.w / 2, p.y - rect.y - rect.h / 2, -(rect.rotation || 0));
    return { x: rect.w / 2 + d.x, y: rect.h / 2 + d.y };
  }
  function aperturePolygon(background, game) {
    if (!game || background.avoidGame === false) return 'none';
    const corners = [
      [0, 0],
      [0, game.h],
      [game.w, game.h],
      [game.w, 0],
      [0, 0],
    ]
      .map(([x, y]) => unprojectPoint(background, point(game, x, y)))
      .map((p) => `${(p.x / background.w) * 100}% ${(p.y / background.h) * 100}%`);
    return 'polygon(evenodd,0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,' + corners.join(',') + ')';
  }
  function contains(rect, p, pad = 0) {
    const d = vector(p.x - rect.x - rect.w / 2, p.y - rect.y - rect.h / 2, -(rect.rotation || 0));
    return Math.abs(d.x) <= rect.w / 2 + pad && Math.abs(d.y) <= rect.h / 2 + pad;
  }
  // Change coordinate systems without moving the native part or its trajectory.
  function rebasePart(part, placement, layout) {
    const next = structuredClone(part);
    if (part.placement === placement) return next;
    next.placement = placement;
    if (!Number.isFinite(layout?.layoutX) || !Number.isFinite(layout?.layoutY)) return next;
    for (const [axis, base] of [
      ['x', layout.layoutX],
      ['y', layout.layoutY],
    ]) {
      const delta = (placement === 'free' ? 1 : -1) * base,
        maximum = axis === 'x' ? 1920 : 1080;
      next[axis] = (part[axis] || 0) + delta;
      for (const track of [...(next.tracks || []), ...(next.exitTracks || [])])
        if (track.property === axis) for (const key of track.keys) key.value += delta;
      const values = [
        next[axis],
        ...[...(next.tracks || []), ...(next.exitTracks || [])]
          .filter((t) => t.property === axis)
          .flatMap((t) => t.keys.map((k) => k.value)),
      ];
      if (values.some((v) => v < -600 || v > maximum)) return null;
    }
    return next;
  }
  // Keep the whole entry/exit trajectory when placing a duplicate near limits.
  function duplicatePartMotion(part, layout, sample = {}, preferred = 12) {
    const value = {
        tracks: structuredClone(part.tracks || []),
        exitTracks: structuredClone(part.exitTracks || []),
      },
      offsets = {};
    for (const axis of ['x', 'y']) {
      const base = part[axis] || 0,
        origin = (layout?.[axis] ?? base) - (sample[axis] ?? base),
        tracks = [...value.tracks, ...value.exitTracks].filter((t) => t.property === axis),
        values = [base, ...tracks.flatMap((t) => t.keys.map((k) => k.value))],
        limit = axis === 'x' ? 1920 : 1080,
        lo = -600 - Math.min(...values) - origin,
        hi = limit - Math.max(...values) - origin;
      const offset =
          preferred >= lo && preferred <= hi
            ? preferred
            : -preferred >= lo && -preferred <= hi
              ? -preferred
              : Math.max(lo, Math.min(hi, preferred)),
        delta = origin + offset;
      offsets[axis] = offset;
      value[axis] = base + delta;
      for (const track of tracks) for (const key of track.keys) key.value += delta;
    }
    return {
      value,
      adjusted: Math.abs(offsets.x - preferred) > 0.001 || Math.abs(offsets.y - preferred) > 0.001,
    };
  }
  const api = {
    vector,
    project,
    point,
    visualBounds,
    unprojectPoint,
    aperturePolygon,
    contains,
    rebasePart,
    duplicatePartMotion,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeGeometry = api;
})(globalThis);
