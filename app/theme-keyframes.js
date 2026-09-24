/* Small, data-only property tracks shared by the editor and renderers. */
(function (root) {
  'use strict';
  const ranges = {
    x: [-600, 1920],
    y: [-600, 1080],
    opacity: [0, 1],
    anchorX: [0, 1920],
    anchorY: [0, 1080],
    intensity: [0, 100],
    flowDensity: [0.1, 3],
    flowWarp: [0, 3],
    flowSpread: [0.2, 3],
    speed: [0.1, 3],
  };
  const labels = {
    x: 'X 偏移',
    y: 'Y 偏移',
    opacity: '不透明度',
    anchorX: '发射点 X',
    anchorY: '发射点 Y',
    intensity: '共振强度',
    flowDensity: '流纹密度',
    flowWarp: '光学扭曲',
    flowSpread: '扩散尺度',
    speed: '流速',
  };
  const maxKeys = 64;
  const partProperties = ['x', 'y', 'opacity'],
    fieldProperties = [
      'anchorX',
      'anchorY',
      'intensity',
      'flowDensity',
      'flowWarp',
      'flowSpread',
      'speed',
    ];
  Object.assign(ranges, {
    scStrength: [0, 100],
    scReach: [12, 140],
    scWarp: [0, 100],
    scRed: [0, 100],
    scDispersion: [0, 100],
    scGhost: [0, 100],
    scSpeed: [0, 100],
    effectGain: [0, 3],
    vhsAmount: [0, 3],
    particleAmount: [0, 2],
    particleSpread: [0.2, 3],
    effectX: [-1920, 1920],
    effectY: [-1080, 1080],
    effectW: [32, 1920],
    effectH: [32, 1080],
  });
  Object.assign(labels, {
    scStrength: 'SC 扭曲强度',
    scReach: 'SC 影响范围',
    scWarp: 'SC 文字折射',
    scRed: 'SC 红光',
    scDispersion: 'SC 边缘色散',
    scGhost: 'SC 光学重影',
    scSpeed: 'SC 流动速度',
    effectGain: '闪现 / 干扰强度',
    vhsAmount: 'VHS 强度',
    particleAmount: '碎光数量',
    particleSpread: '碎光扩散范围',
    effectX: '影响区域 X',
    effectY: '影响区域 Y',
    effectW: '影响区域宽度',
    effectH: '影响区域高度',
  });
  const scMap = {
    scStrength: 'strength',
    scReach: 'reach',
    scWarp: 'textWarp',
    scRed: 'red',
    scDispersion: 'dispersion',
    scGhost: 'ghost',
    scSpeed: 'speed',
  };
  const componentProperties = (type) =>
    type === 'resonance'
      ? fieldProperties
      : type === 'sc'
        ? Object.keys(scMap)
        : type === 'fleet'
          ? [
              'effectGain',
              'vhsAmount',
              'particleAmount',
              'particleSpread',
              'effectX',
              'effectY',
              'effectW',
              'effectH',
            ]
          : [];
  const n = (v, a, b, d = 0) => Math.max(a, Math.min(b, Number.isFinite(+v) ? +v : d));
  function normalize(raw, allowed = partProperties) {
    const used = new Set(),
      out = [];
    for (const track of Array.isArray(raw) ? raw.slice(0, 12) : []) {
      if (!track || !allowed.includes(track.property) || used.has(track.property)) continue;
      used.add(track.property);
      const times = new Map();
      for (const key of Array.isArray(track.keys) ? track.keys.slice(0, maxKeys) : []) {
        if (!key || !Number.isFinite(+key.value)) continue;
        const time = Math.round(n(key.time, 0, 30000)),
          range = ranges[track.property];
        times.set(time, {
          time,
          value: n(key.value, ...range),
          ease: ['linear', 'smooth', 'in', 'out', 'hold', 'bezier'].includes(key.ease)
            ? key.ease
            : 'smooth',
          ...(key.ease === 'bezier' ? { curve: normalizeCurve(key.curve) } : {}),
        });
      }
      const keys = [...times.values()].sort((a, b) => a.time - b.time);
      if (keys.length)
        out.push({
          property: track.property,
          keys,
          ...(track.enabled === false ? { enabled: false } : {}),
        });
    }
    return out;
  }
  function putKey(track, time, value) {
    const at = Math.round(n(time, 0, 30000)),
      found = track.keys.find((k) => k.time === at);
    if (found) {
      found.value = value;
      return true;
    }
    if (track.keys.length >= maxKeys) return false;
    track.keys.push({ time: at, value, ease: 'smooth' });
    return true;
  }
  function availableTime(keys, index, time) {
    const wanted = Math.round(n(time, 0, 30000)),
      occupied = new Set(keys.filter((_, i) => i !== index).map((k) => k.time)),
      direction = wanted > keys[index].time ? 1 : -1;
    if (!occupied.has(wanted)) return wanted;
    for (let distance = 1; distance <= keys.length; distance++)
      for (const sign of [direction, -direction]) {
        const at = wanted + distance * sign;
        if (at >= 0 && at <= 30000 && !occupied.has(at)) return at;
      }
    return keys[index].time;
  }
  function normalizeCurve(curve) {
    const fallback = [1 / 3, 0, 2 / 3, 1];
    return fallback.map((v, i) =>
      Array.isArray(curve) && curve.length === 4 ? n(curve[i], 0, 1, v) : v,
    );
  }
  function bezier(t, curve) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const [x1, y1, x2, y2] = curve || [1 / 3, 0, 2 / 3, 1],
      at = (u, a, b) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 20; i++) {
      const u = (lo + hi) / 2;
      if (at(u, x1, x2) < t) lo = u;
      else hi = u;
    }
    return at((lo + hi) / 2, y1, y2);
  }
  function ease(t, type, curve) {
    return type === 'bezier'
      ? bezier(t, curve)
      : type === 'hold'
        ? 0
        : type === 'linear'
          ? t
          : type === 'in'
            ? t * t * t
            : type === 'out'
              ? 1 - (1 - t) ** 3
              : t * t * (3 - 2 * t);
  }
  function hasTracks(owner, exitTime = -1) {
    return !!(
      owner?.tracks?.some((t) => t.enabled !== false) ||
      (exitTime >= 0 && owner?.exitTracks?.some((t) => t.enabled !== false))
    );
  }
  function duration(owner) {
    return Math.max(0, ...(owner?.tracks || []).flatMap((t) => t.keys.map((k) => k.time)));
  }
  function retime(track, start, length) {
    const copy = structuredClone(track),
      keys = copy.keys || [];
    if (!keys.length) return copy;
    keys.sort((a, b) => a.time - b.time);
    const minimum = Math.max(0, keys.length - 1),
      first = keys[0].time,
      span = keys.at(-1).time - first;
    start = Math.round(n(start, 0, 30000 - minimum, first));
    length = keys.length === 1 ? 0 : Math.round(n(length, minimum, 30000 - start, span));
    let previous = start - 1;
    keys.forEach((key, i) => {
      const wanted =
        start +
        Math.round(
          span > 0
            ? ((key.time - first) / span) * length
            : (i / Math.max(1, keys.length - 1)) * length,
        );
      key.time = Math.max(previous + 1, Math.min(start + length - (keys.length - 1 - i), wanted));
      previous = key.time;
    });
    return copy;
  }
  function sampleTracks(owner, time) {
    const out = {},
      length = duration(owner);
    if (owner?.motionLoop && length > 0) time = ((time % length) + length) % length;
    else time = Math.max(0, time);
    for (const track of owner?.tracks || []) {
      if (track.enabled === false) continue;
      const keys = track.keys;
      if (!keys.length) continue;
      if (time <= keys[0].time) {
        out[track.property] = keys[0].value;
        continue;
      }
      if (time >= keys.at(-1).time) {
        out[track.property] = keys.at(-1).value;
        continue;
      }
      let right = 1;
      while (keys[right].time < time) right++;
      if (time === keys[right].time) {
        out[track.property] = keys[right].value;
        continue;
      }
      const a = keys[right - 1],
        b = keys[right],
        p = ease((time - a.time) / (b.time - a.time), a.ease, a.curve);
      out[track.property] = a.value + (b.value - a.value) * p;
    }
    return out;
  }
  function sample(owner, time, exitTime = -1) {
    const values = sampleTracks(owner, time);
    return exitTime >= 0 && owner?.exitTracks?.length
      ? Object.assign(values, sampleTracks({ tracks: owner.exitTracks }, exitTime))
      : values;
  }
  function remember(p) {
    return { ...p, motionBase: { x: p.x || 0, y: p.y || 0, opacity: p.opacity ?? 1 } };
  }
  function component(style, time, exitTime = -1) {
    return hasTracks(style, exitTime) ? { ...style, ...sample(style, time, exitTime) } : style;
  }
  function scFX(style, time, base, exitTime = -1) {
    if (!hasTracks(style, exitTime)) return base;
    const values = sample(style, time, exitTime),
      result = { ...base };
    for (const [key, value] of Object.entries(values)) if (scMap[key]) result[scMap[key]] = value;
    return result;
  }
  function part(p, time, exitTime = -1) {
    if (!hasTracks(p, exitTime)) return { dx: 0, dy: 0, opacity: p.opacity ?? 1 };
    const sampled = sample(p, time, exitTime),
      base = p.motionBase || p;
    return {
      dx: sampled.x === undefined ? 0 : sampled.x - (base.x || 0),
      dy: sampled.y === undefined ? 0 : sampled.y - (base.y || 0),
      opacity: sampled.opacity ?? p.opacity ?? 1,
    };
  }
  const api = {
    maxKeys,
    putKey,
    availableTime,
    normalizeCurve,
    bezier,
    scMap,
    ranges,
    labels,
    partProperties,
    fieldProperties,
    componentProperties,
    hasTracks,
    normalize,
    sample,
    duration,
    retime,
    remember,
    part,
    component,
    scFX,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeKeyframes = api;
})(globalThis);
