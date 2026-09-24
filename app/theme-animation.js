/* Retimes the native effect stages, without scaling the finished drawing. */
(function (root) {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
  function bezier(t, curve = [0, 0, 1, 1]) {
    t = clamp(t, 0, 1);
    const [x1, y1, x2, y2] = curve,
      at = (u, a, b) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 18; i++) {
      const u = (lo + hi) / 2;
      if (at(u, x1, x2) < t) lo = u;
      else hi = u;
    }
    return t === 0 ? 0 : t === 1 ? 1 : clamp(at((lo + hi) / 2, y1, y2), 0, 1);
  }
  function duration(spec, native) {
    return spec?.animationEnabled === false
      ? 0
      : spec?.animationCustom
        ? (spec.entranceMs || native) + (spec.entranceDelay || 0)
        : native;
  }
  function age(real, spec, native) {
    if (spec?.animationEnabled === false) return native + Math.max(0, real);
    if (!spec?.animationCustom) return real;
    const delay = spec.entranceDelay || 0,
      length = spec.entranceMs || native,
      t = real - delay;
    if (t < 0) return -1;
    if (t >= length) return native + t - length;
    return native * bezier(t / length, spec.curve);
  }
  const api = { bezier, duration, age };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeAnimation = api;
})(globalThis);
