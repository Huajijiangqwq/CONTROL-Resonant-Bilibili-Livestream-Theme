/* Shared geometry sampling keeps the OBS source and live browser on one curve. */
(function (root) {
  'use strict';
  const keys = [
    'x',
    'y',
    'w',
    'h',
    'rotation',
    'opacity',
    'paddingTop',
    'paddingBottom',
    'paddingX',
    'anchorX',
    'anchorY',
  ];
  const geometry = (doc) =>
    Object.fromEntries(
      doc.layers.map((l) => [
        l.id,
        Object.fromEntries(keys.filter((k) => Number.isFinite(l[k])).map((k) => [k, l[k]])),
      ]),
    );
  function sample(doc, from, progress) {
    const p = Math.max(0, Math.min(1, progress)),
      t = p * p * p * (p * (p * 6 - 15) + 10);
    if (t >= 1) return doc;
    return {
      ...doc,
      layers: doc.layers.map((l) => {
        const prior = from?.[l.id];
        if (!prior) return l;
        const value = { ...l };
        for (const k of keys)
          if (Number.isFinite(prior[k]) && Number.isFinite(l[k]))
            value[k] = prior[k] + (l[k] - prior[k]) * t;
        return value;
      }),
    };
  }
  const at = (packet, now = Date.now()) =>
    sample(
      packet.document,
      packet.from,
      packet.duration ? (now - packet.startAt) / packet.duration : 1,
    );
  const api = { geometry, sample, at };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeSyncMotion = api;
})(globalThis);
