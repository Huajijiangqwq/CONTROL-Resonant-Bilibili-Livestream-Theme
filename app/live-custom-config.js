(function (root) {
  'use strict';
  const names = {
    game: '游戏窗口',
    normal: '普通弹幕',
    sc: 'SC 轮播',
    gift: '礼物档案',
    fleet: '上舰提示',
    header: '主播与直播状态',
    logos: '中英双 Logo',
    timer: '直播计时',
    music: 'Now Playing',
  };
  const base = {
    game: [0, 0, 1920, 1080],
    normal: [1568, 144, 324, 348],
    sc: [1554, 510, 354, 290],
    gift: [36, 800, 326, 172],
    fleet: [640, 40, 640, 450],
    header: [1403, 20, 485, 33],
    logos: [1528, 64, 360, 34],
    timer: [40, 1008, 400, 43],
    music: [42, 622, 400, 116.667],
  };
  const number = (x, a, b, d) =>
    Math.max(a, Math.min(b, Number.isFinite(Number(x)) ? Number(x) : d));
  function rect(raw = {}, fallback = [80, 80, 400, 90], ratio = 0) {
    let w = number(raw.w, 24, 1920, fallback[2]),
      h = number(raw.h, 24, 1080, fallback[3]);
    if (ratio) {
      w = Math.min(w, 1080 * ratio);
      h = w / ratio;
    }
    return {
      x: +number(raw.x, 0, 1920 - w, fallback[0]).toFixed(2),
      y: +number(raw.y, 0, 1080 - h, fallback[1]).toFixed(2),
      w: +w.toFixed(2),
      h: +h.toFixed(2),
      enabled: raw.enabled !== false,
    };
  }
  function safeImage(value) {
    const s = String(value || '')
      .trim()
      .slice(0, 600000);
    if (/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(s)) return s;
    try {
      const u = new URL(s, 'http://127.0.0.1:8791/');
      return s && !s.startsWith('//') && ['http:', 'https:'].includes(u.protocol) ? s : '';
    } catch {
      return '';
    }
  }
  function normalize(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    const elements = {};
    for (const [key, r] of Object.entries(base)) {
      const supplied = { ...value.elements?.[key] };
      if (['normal', 'sc', 'gift', 'fleet'].includes(key))
        supplied.w = number(supplied.w, 160, 1920, r[2]);
      elements[key] = rect(
        { ...supplied, enabled: supplied.enabled ?? !['timer', 'music'].includes(key) },
        r,
        key === 'game' ? 16 / 9 : key === 'music' ? 24 / 7 : 0,
      );
    }
    const seen = new Set(),
      extras = [];
    for (const item of Array.isArray(value.extras) ? value.extras.slice(0, 12) : []) {
      if (!item || !/^item-[a-z0-9-]{1,50}$/.test(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      const type = item.type === 'image' ? 'image' : 'text';
      extras.push({
        ...rect(item),
        id: item.id,
        type,
        name: String(item.name || (type === 'image' ? '图片' : '文字')).slice(0, 30),
        text: String(item.text ?? '新的通讯').slice(0, 600),
        size: number(item.size, 12, 180, 36),
        weight: [400, 500, 600, 700, 800, 900].includes(+item.weight) ? +item.weight : 700,
        color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#f1f0e9',
        src: safeImage(item.src),
      });
    }
    return { version: 1, elements, extras };
  }
  const api = { normalize, rect, safeImage, names, base };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CustomLayoutConfig = api;
})(typeof window === 'object' ? window : globalThis);
