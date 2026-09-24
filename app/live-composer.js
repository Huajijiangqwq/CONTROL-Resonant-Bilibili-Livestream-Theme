((root) => {
  'use strict';
  const fields = {
    sender: '调查员 12',
    giftName: '能量电池',
    quantity: '10',
    value: '1000',
    duration: '180',
  };
  const textLimit =
    typeof module === 'object' && module.exports ? require('./text-limit.js') : root.TextLimit;
  const text = (value, fallback, length) =>
    typeof value === 'string' ? textLimit.take(value, length) : fallback;
  function normalize(value) {
    const input = value && typeof value === 'object' ? value : {},
      bodies = input.bodies && typeof input.bodies === 'object' ? input.bodies : {};
    const state = {
      kind: ['normal', 'gift', 'sc', 'fleet'].includes(input.kind) ? input.kind : 'normal',
      tier: ['0', '1', '2', '3', '4', '5', '6'].includes(input.tier) ? input.tier : '3',
      rank: ['captain', 'admiral', 'governor'].includes(input.rank) ? input.rank : 'captain',
      bodies: {
        normal: text(bodies.normal, '继续探索。', 300),
        sc: text(bodies.sc, '前面有希斯，小心。', 1600),
      },
    };
    for (const [key, fallback] of Object.entries(fields))
      state[key] = text(input[key], fallback, key === 'sender' ? 50 : key === 'giftName' ? 60 : 24);
    return state;
  }
  const api = { normalize };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiveComposer = api;
})(globalThis);
