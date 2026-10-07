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
  function hitLayer(rect, p, pad = 0) {
    const local = unprojectPoint(rect, p);
    if (rect.type === 'background' && rect.mode === 'transparent') return false;
    if (rect.type !== 'border' && !(rect.type === 'shape' && ['none', 'transparent'].includes(rect.fill)))
      return contains(rect, p, rect.type === 'line' ? pad : 0);
    const stroke = Math.max(0, Number(rect.strokeWidth) || 0);
    if (!stroke) return false;
    const tolerance = stroke / 2 + pad;
    if (rect.borderStyle === 'corners') {
      const gap = Math.min(rect.cornerInset || 0, rect.w / 2, rect.h / 2),
        length = Math.max(0, Math.min(rect.cornerLength || 0, (rect.w - 2 * gap) / 2, (rect.h - 2 * gap) / 2));
      if (!length) return false;
      const distance = (x1, y1, x2, y2) => {
        const dx = x2 - x1, dy = y2 - y1,
          t = Math.max(0, Math.min(1, ((local.x - x1) * dx + (local.y - y1) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(local.x - x1 - dx * t, local.y - y1 - dy * t);
      };
      return [[gap, gap, 1, 1], [rect.w - gap, gap, -1, 1], [gap, rect.h - gap, 1, -1], [rect.w - gap, rect.h - gap, -1, -1]]
        .some(([x, y, sx, sy]) => Math.min(distance(x, y, x + sx * length, y), distance(x, y, x, y + sy * length)) <= tolerance);
    }
    const roundedDistance = inset => {
      const w = Math.max(0, rect.w - inset * 2), h = Math.max(0, rect.h - inset * 2),
        radius = Math.max(0, Math.min((rect.radius || 0) - (inset > stroke ? inset : 0), w / 2, h / 2)),
        x = Math.abs(local.x - rect.w / 2) - w / 2 + radius,
        y = Math.abs(local.y - rect.h / 2) - h / 2 + radius;
      return Math.abs(Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0) - radius);
    };
    return roundedDistance(stroke / 2) <= tolerance ||
      (rect.borderStyle === 'double' && roundedDistance(stroke * 2 + 3) <= tolerance);
  }
  function selectionUnits(layers, selected, editable = () => true) {
    const ids = selected instanceof Set ? selected : new Set(selected), units = [];
    for (const l of layers) {
      if (!ids.has(l.id) || (l.parent && ids.has(l.parent))) continue;
      const members = (l.type === 'group' ? layers.filter(c => c.parent === l.id) : [l])
        .filter(editable);
      if (members.length) units.push({ id: l.id, members, bounds: visualBounds(members) });
    }
    return units;
  }
  function marqueeSelection(layers, area, { painted = () => true, editable = () => true, deep = false } = {}) {
    const visible = layers.filter(l => l.type !== 'group' && painted(l)),
      inside = l => {
        const box = visualBounds([l]);
        return box.x >= area.x && box.y >= area.y && box.x + box.w <= area.x + area.w && box.y + box.h <= area.y + area.h;
      };
    if (deep) return visible.filter(l => editable(l) && inside(l)).map(l => l.id);
    const result = visible.filter(l => !l.parent && editable(l) && inside(l)).map(l => l.id);
    for (const group of layers.filter(l => l.type === 'group' && editable(l))) {
      const members = visible.filter(l => l.parent === group.id);
      if (members.length && members.some(editable) && members.every(inside)) result.push(group.id);
    }
    return result;
  }
  function alignmentDelta(rect, target, edge) {
    return {
      x: edge === 'left' ? target.x - rect.x : edge === 'right' ? target.x + target.w - rect.x - rect.w
        : edge === 'center' ? target.x + target.w / 2 - rect.x - rect.w / 2 : 0,
      y: edge === 'top' ? target.y - rect.y : edge === 'bottom' ? target.y + target.h - rect.y - rect.h
        : edge === 'middle' ? target.y + target.h / 2 - rect.y - rect.h / 2 : 0,
    };
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
        maximum = axis === 'x' ? 7680 : 4320;
      next[axis] = (part[axis] || 0) + delta;
      for (const track of [...(next.tracks || []), ...(next.exitTracks || [])])
        if (track.property === axis) for (const key of track.keys) key.value += delta;
      const values = [
        next[axis],
        ...[...(next.tracks || []), ...(next.exitTracks || [])]
          .filter((t) => t.property === axis)
          .flatMap((t) => t.keys.map((k) => k.value)),
      ];
      if (values.some((v) => v < -maximum || v > maximum)) return null;
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
        limit = axis === 'x' ? 7680 : 4320,
        lo = -limit - Math.min(...values) - origin,
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
    hitLayer,
    selectionUnits,
    marqueeSelection,
    alignmentDelta,
    rebasePart,
    duplicatePartMotion,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeGeometry = api;
})(globalThis);
