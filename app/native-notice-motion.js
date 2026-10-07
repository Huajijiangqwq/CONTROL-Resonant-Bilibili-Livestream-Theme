/* Small deterministic accents beneath the existing material and film effects. */
(function(root) {
  'use strict';
  const clamp = value => { const n = Number(value); return Number.isNaN(n) ? 0 : Math.max(0, Math.min(1, n)); };
  const ease = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * t * (10 + t * (-15 + t * 6)); };
  function fleetExit(progress, rank = 'captain', reduced = false) {
    const p = clamp(progress), level = rank === 'governor' ? 2 : rank === 'admiral' ? 1 : 0;
    const tension = ease(0, .1, p) * (1 - ease(.1, .24, p)), outer = ease(.1, .69 + level * .055, p), inner = ease(.21, .82, p);
    const iconClose = ease(.27, .72 + level * .035, p), titleClose = ease(.29, .79, p);
    return {
      outer, outerScale: reduced ? 1 : 1 + tension * (.012 + level * .005),
      outerAlpha: 1 - ease(.54 + level * .055, 1, p), inner,
      innerScale: reduced ? 1 : 1 - .16 * inner, innerAngle: reduced ? 0 : -(3 + level * 1.5) * Math.PI / 180 * inner,
      innerAlpha: 1 - ease(.42, .92, p), iconAlpha: 1 - ease(.52, .9, p), iconClip: 1 - iconClose,
      iconY: reduced ? 0 : -(8 + level * 3) * ease(.18, .78, p),
      titleWidth: 1 - .93 * titleClose, titleHeight: 1 - ease(.39, .82, p), titleAlpha: 1 - ease(.44, .86, p), titleInkAlpha: 1 - ease(.2, .6, p),
      titleY: reduced ? 0 : -3 * ease(.18, .62, p),
      nameAlpha: 1 - ease(.14, .63, p), nameY: reduced ? 0 : -(8 + level * 2) * ease(.08, .64, p),
      reduced,
    };
  }
  function scPart(kind, age, exitAge = -1, tier = 3, reduced = false) {
    if (['card', 'image', 'shape', 'line'].includes(kind)) return { x: 0, y: 0, alpha: 1 };
    const role = ['signal', 'label'].includes(kind) ? 0 : ['name', 'amount'].includes(kind) ? 1 : kind === 'body' ? 2 : 3;
    const begin = [470, 515, 585, 640][role], end = [660, 755, 870, 930][role], enter = ease(begin, end, age);
    const weight = .72 + clamp(Number(tier) / 6) * .38;
    const leave = exitAge < 0 ? 0 : ease([190, 45, 90, 260][role], [550, 345, 455, 635][role], exitAge);
    return { x: reduced ? 0 : role === 0 ? -3 * (1 - enter) || 0 : 0,
      y: reduced ? 0 : (role === 2 ? 8 : role === 1 ? 5 : 3) * (1 - enter) * weight - (role === 2 ? 6 : 3) * leave * weight,
      alpha: enter * (1 - leave) };
  }
  function scActive(age, exitAge = -1, delay = 0) {
    return exitAge >= 0 ? exitAge < 660 : age < 960 + Math.max(0, delay);
  }
  const media = root.matchMedia?.('(prefers-reduced-motion: reduce)');
  const api = { fleetExit, scPart, scActive, get reduced() { return !!media?.matches; } };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NativeNoticeMotion = api;
})(globalThis);
