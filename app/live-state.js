(function (root) {
  'use strict';
  const textLimit =
    typeof module === 'object' && module.exports ? require('./text-limit.js') : root.TextLimit;
  const clean = (value, fallback, max) =>
    typeof value === 'string' ? textLimit.take(value.replace(/[\r\n\t]/g, ' '), max) : fallback;
  const safeTime = (value) => (Number.isFinite(value) && value >= 0 ? value : 0);
  function normalize(value = {}, now = Date.now()) {
    return {
      host: clean(value.host, '调查员 07', 30),
      topic: clean(value.topic, '今晚继续探索', 64),
      splitTopic: value.splitTopic === true,
      nowPlaying: value.nowPlaying === true,
      elapsedMs: safeTime(value.elapsedMs),
      startedAt:
        value.startedAt === null
          ? null
          : Number.isFinite(value.startedAt) && value.startedAt > 0
            ? Math.min(value.startedAt, now)
            : now,
    };
  }
  function elapsed(state, now = Date.now()) {
    return (
      safeTime(state.elapsedMs) +
      (state.startedAt === null ? 0 : Math.max(0, now - state.startedAt))
    );
  }
  function toggle(state, now = Date.now()) {
    return {
      ...state,
      elapsedMs: elapsed(state, now),
      startedAt: state.startedAt === null ? now : null,
    };
  }
  function reset(state, now = Date.now()) {
    return { ...state, elapsedMs: 0, startedAt: state.startedAt === null ? null : now };
  }
  function format(ms) {
    const t = Math.floor(safeTime(ms) / 1000);
    return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
  }
  function parseDuration(text) {
    const m = /^(\d{1,4}):([0-5]?\d):([0-5]?\d)$/.exec(text.trim().replace(/：/g, ':'));
    return m ? (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 : null;
  }
  function query(state) {
    return {
      host: state.host,
      topic: state.topic,
      splitTopic: state.splitTopic ? '1' : '0',
      nowPlaying: state.nowPlaying ? '1' : '0',
      elapsed: String(state.elapsedMs),
      start: state.startedAt === null ? 'paused' : String(state.startedAt),
    };
  }
  function fromQuery(params, base, now = Date.now()) {
    const result = { ...base };
    for (const k of ['host', 'topic']) if (params.has(k)) result[k] = params.get(k);
    if (params.has('splitTopic')) result.splitTopic = params.get('splitTopic') === '1';
    if (params.has('nowPlaying')) result.nowPlaying = params.get('nowPlaying') === '1';
    if (params.has('elapsed')) result.elapsedMs = Number(params.get('elapsed'));
    if (params.has('start'))
      result.startedAt = params.get('start') === 'paused' ? null : Number(params.get('start'));
    return normalize(result, now);
  }
  const api = { normalize, elapsed, toggle, reset, format, parseDuration, query, fromQuery };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiveState = api;
})(typeof window === 'object' ? window : globalThis);
