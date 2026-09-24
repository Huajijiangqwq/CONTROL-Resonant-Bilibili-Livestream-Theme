(function (root) {
  'use strict';
  let custom = { elements: {} };
  const modes = {
    classic: {
      name: '完整主题',
      game: { x: 18, y: 72, w: 1408, h: 792 },
      panel: { x: 1444, y: 72, w: 458, h: 908 },
    },
    game: {
      name: '游戏优先',
      game: { x: 18, y: 62, w: 1632, h: 918 },
      panel: { x: 1668, y: 62, w: 234, h: 918 },
    },
    custom: {
      name: '自定义',
      game: { x: 0, y: 0, w: 1920, h: 1080 },
      panel: { x: 0, y: 0, w: 1920, h: 1080 },
    },
    split: {
      name: '全屏分区',
      game: { x: 0, y: 0, w: 1920, h: 1080 },
      panel: { x: 0, y: 0, w: 1920, h: 1080 },
    },
  };
  // Visible regions in the 1920 x 1080 scene. Padding belongs to the effect,
  // so message renderers can keep their original optical material and scale.
  const zones = {
    normal: {
      name: '普通弹幕',
      x: 1568,
      y: 144,
      w: 324,
      h: 348,
      bleed: 100,
      width: 456,
      fontSize: 27,
      lineHeight: 146,
    },
    sc: {
      name: 'SC · 跟随聊天下沿',
      x: 1554,
      y: 510,
      w: 354,
      h: 290,
      bleed: 0,
      width: 416,
      fontSize: 28,
      lineHeight: 145,
    },
    gift: {
      name: '礼物',
      x: 36,
      y: 800,
      w: 326,
      h: 172,
      bleed: 100,
      width: 516,
      fontSize: 28,
      lineHeight: 145,
    },
    fleet: {
      name: '上舰 · 原片位置 / 全屏特效',
      x: 640,
      y: 40,
      w: 640,
      h: 450,
      bleed: 80,
      width: 456,
      fontSize: 31,
      lineHeight: 145,
    },
  };
  // Keep existing OBS links usable after retiring the old immersive layout.
  const normalize = (value) =>
    value === 'fullscreen'
      ? 'split'
      : Object.prototype.hasOwnProperty.call(modes, value)
        ? value
        : 'classic';
  function setCustom(value) {
    custom = value || { elements: {} };
    modes.custom.game = { ...modes.split.game, ...custom.elements?.game };
  }
  const api = {
    modes,
    zones,
    normalize,
    setCustom,
    zone: (kind, mode) =>
      mode === 'custom' ? { ...zones[kind], ...custom.elements?.[kind] } : zones[kind],
    get: (value) => modes[normalize(value)],
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiveLayoutConfig = api;
})(typeof window === 'object' ? window : globalThis);
