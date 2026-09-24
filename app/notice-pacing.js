((root) => {
  'use strict';
  function windowFor(
    kind,
    text = '',
    remaining = Infinity,
    exitDuration = 1100,
    entranceDuration = 0,
  ) {
    let hold = kind === 'fleet' ? 2500 : kind === 'gift' ? 1900 : 0;
    if (kind === 'sc') {
      const length = Array.from(String(text).replace(/\s/g, '')).length;
      hold = 1000 + Math.max(1600, Math.min(4400, 800 + length * 60));
      // A short-lived message needs room for its existing exit animation, too.
      if (Number.isFinite(remaining) && remaining >= 0 && remaining * 1000 <= hold)
        hold = Math.max(hold, remaining * 1000 + exitDuration);
    }
    if (kind === 'fleet' && entranceDuration > 0) hold = Math.max(hold, entranceDuration + 1100);
    return {
      hold,
      context:
        kind === 'sc'
          ? 720
          : kind === 'fleet'
            ? Math.max(1100, entranceDuration * 0.68)
            : kind === 'gift'
              ? 560
              : 0,
    };
  }
  function allowance({
    now,
    until,
    contextAt,
    following,
    nextKind,
    top,
    tail,
    nextHeight,
    viewHeight,
  }) {
    if (!following || !Number.isFinite(until) || now >= until) return 6;
    if (now < contextAt || nextKind !== 'normal') return 0;
    return tail + nextHeight - top <= viewHeight - 24 ? 1 : 0;
  }
  function giftUpdateWindow(previous, now) {
    // Finish the 340 ms ink update, then leave time to read the new total.
    // An early combo must also retain the initial dossier's longer reading hold.
    return {
      until: Math.max(previous?.until ?? 0, now + 1000),
      contextAt: Math.max(previous?.contextAt ?? 0, now + 340),
    };
  }
  const api = { windowFor, allowance, giftUpdateWindow };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NoticePacing = api;
})(globalThis);
