/* The live skin and music service share these recording controls. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NowPlayingSettings = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const signal = Object.freeze({
    strength: Object.freeze({ label: '总体强度', min: 0, max: 1.5, step: .05, value: 1.05, unit: '%' }),
    softness: Object.freeze({ label: '轮廓柔化', min: 0, max: 2.5, step: .05, value: 1.5, unit: '×' }),
    bleed: Object.freeze({ label: '拖色宽度', min: 0, max: 8, step: .1, value: 4.5, unit: 'px' }),
    offset: Object.freeze({ label: '基础颜色错位', min: -6, max: 6, step: .1, value: 1.8, unit: 'px' }),
    motion: Object.freeze({ label: '动态错位', min: 0, max: 2.5, step: .05, value: 1, unit: '×' }),
    hue: Object.freeze({ label: '偏色强度', min: 0, max: 2.5, step: .05, value: 1, unit: '×' }),
    noise: Object.freeze({ label: '信号颗粒', min: 0, max: 2.5, step: .05, value: 1, unit: '×' }),
    frequency: Object.freeze({ label: '偶发干扰频率', min: 0, max: 3, step: .1, value: 1, unit: '×' }),
  });
  const signalDefaults = Object.freeze(Object.fromEntries(Object.entries(signal).map(([key, field]) => [key, field.value])));
  function signalPatch(input, strict = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      if (strict) throw Error('录像质感设置无效');
      return {};
    }
    const out = {};
    for (const [key, field] of Object.entries(signal)) {
      if (input[key] === undefined) continue;
      const n = Number(input[key]);
      if (!Number.isFinite(n) || input[key] === null || typeof input[key] === 'boolean' || input[key] === '') {
        if (strict) throw Error('录像参数无效：' + field.label);
        continue;
      }
      if (strict && (n < field.min || n > field.max)) throw Error('录像参数超出范围：' + field.label);
      out[key] = Math.max(field.min, Math.min(field.max, n));
    }
    return out;
  }
  function normalizeSignal(input) { return { ...signalDefaults, ...signalPatch(input) }; }
  function formatSignal(key, value) {
    const field = signal[key];
    return field.unit === '%' ? Math.round(value * 100) + '%' : Number(value.toFixed(2)) + ' ' + field.unit;
  }
  return { signal, signalDefaults, signalPatch, normalizeSignal, formatSignal };
});
