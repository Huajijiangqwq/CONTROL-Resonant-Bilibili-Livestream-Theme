(function (root) {
  'use strict';
  const targets = ['spread', 'flow', 'fibers', 'optics', 'glow', 'none'];
  function defaults() {
    return [
      { from: 30, to: 180, target: 'spread', gain: 1, max: 1 },
      { from: 180, to: 2000, target: 'flow', gain: 1, max: 1 },
      { from: 2000, to: 12000, target: 'fibers', gain: 1, max: 1 },
    ];
  }
  function validate(value) {
    if (!Array.isArray(value) || value.length !== 3) throw new Error('需要三个频段设置');
    return value.map((b) => {
      if (
        !b ||
        !Number.isFinite(b.from) ||
        !Number.isFinite(b.to) ||
        b.from < 20 ||
        b.to > 20000 ||
        b.to - b.from < 20
      )
        throw new Error('频率范围须为 20–20000 Hz，宽度至少 20 Hz');
      if (!targets.includes(b.target)) throw new Error('请选择有效的响应效果');
      if (!Number.isFinite(b.gain) || b.gain < 0.25 || b.gain > 4)
        throw new Error('分频灵敏度须为 0.25–4 倍');
      if (!Number.isFinite(b.max) || b.max < 0 || b.max > 1) throw new Error('最大响应须为 0–100%');
      return {
        from: Math.round(b.from),
        to: Math.round(b.to),
        target: b.target,
        gain: b.gain,
        max: b.max,
      };
    });
  }
  const api = { defaults, validate };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AudioConfig = api;
})(typeof window === 'object' ? window : globalThis);
