(function (root) {
  'use strict';
  const defaults = { fleetHold: 8, fleetExit: 0.7, giftHold: 6, giftExit: 0.6 };
  const clamp = (n, a, b, d) =>
    Number.isFinite(Number(n)) ? Math.max(a, Math.min(b, Number(n))) : d;
  const ease = (t) => {
    t = clamp(t, 0, 1, 0);
    return t * t * (3 - 2 * t);
  };
  function normalize(raw = {}) {
    const out = {};
    for (const k of Object.keys(defaults))
      out[k] = clamp(
        raw[k] ?? defaults[k],
        k.endsWith('Hold') ? 0 : 0.2,
        k.endsWith('Hold') ? 3600 : 4,
        defaults[k],
      );
    return out;
  }
  function start(m, clock, entry, config) {
    if (!['fleet', 'gift'].includes(m.kind)) return;
    const c = normalize(config),
      hold = c[m.kind + 'Hold'];
    m.noticeExitAt = hold === 0 ? Infinity : clock + Math.max(0, entry) + hold * 1000;
    m.noticeExitMs = c[m.kind + 'Exit'] * 1000;
  }
  function progress(m, clock) {
    return Number.isFinite(m.noticeExitAt) && clock >= m.noticeExitAt
      ? clamp((clock - m.noticeExitAt) / m.noticeExitMs, 0, 1, 0)
      : -1;
  }
  const api = {
    defaults,
    normalize,
    start,
    progress,
    ease,
    finished: (m, clock) => progress(m, clock) >= 1,
    occupied: (m, clock) => 1 - ease((progress(m, clock) - 0.6) / 0.4),
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NoticeLifetime = api;
})(typeof window === 'object' ? window : globalThis);
