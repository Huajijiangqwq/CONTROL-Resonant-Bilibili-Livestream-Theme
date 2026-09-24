/* Layout choreography never owns the message or fluid clocks. */
(function (root) {
  'use strict';
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => {
    x = clamp(x);
    return x * x * x * (10 + x * (-15 + 6 * x));
  };
  function plan(from, to) {
    return ['split', 'custom'].includes(from) || ['split', 'custom'].includes(to)
      ? { exit: 340, move: 900, enter: 660, total: 1900 }
      : { exit: 280, move: 760, enter: 540, total: 1580 };
  }
  function sample(p, age) {
    const move = clamp((age - p.exit) / p.move),
      enter = clamp((age - p.exit - p.move) / p.enter);
    const phase =
      age < p.exit ? 'exit' : age < p.exit + p.move ? 'move' : age < p.total ? 'enter' : 'idle';
    return {
      phase,
      commit: age >= p.exit,
      geometry: ease(move),
      enter,
      visibility: phase === 'exit' ? 1 - ease(age / p.exit) : phase === 'move' ? 0 : ease(enter),
      done: age >= p.total,
    };
  }
  const api = { ease, plan, sample };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiveLayoutMotion = api;
})(typeof window === 'object' ? window : globalThis);
