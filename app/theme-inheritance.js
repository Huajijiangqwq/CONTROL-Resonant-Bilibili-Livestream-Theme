/* Explain which native part values supersede a component default. */
(function (root) {
  'use strict';
  const map = {
    fleet: {
      iconSize: [['badge', ['size'], '宽度']],
      titleSize: [['title', ['size'], '字号']],
      nameSize: [['name', ['size'], '字号']],
      nameWidth: [['name', ['w'], '换行宽度']],
    },
    gift: {
      titleSize: [['title', ['size'], '字号']],
      fontSize: [
        ['name', ['size'], '字号'],
        ['quantity', ['size'], '字号'],
        ['value', ['size'], '字号'],
        ['note', ['size'], '字号'],
      ],
      photoSize: [['photo', ['size', 'w'], '尺寸']],
      paperColor: [['paper', ['color'], '纸色']],
    },
    normal: {
      fontSize: [
        ['name', ['size'], '字号'],
        ['body', ['size'], '字号'],
      ],
      linePercent: [['body', ['linePercent'], '行高']],
      bodyWeight: [
        ['name', ['weight'], '字重'],
        ['body', ['weight'], '字重'],
      ],
      nameColor: [['name', ['color'], '颜色']],
      bodyColor: [['body', ['color'], '颜色']],
    },
    sc: {
      fontSize: [
        ['name', ['size'], '字号'],
        ['amount', ['size'], '字号'],
        ['body', ['size'], '字号'],
      ],
      linePercent: [
        ['name', ['linePercent'], '行高'],
        ['amount', ['linePercent'], '行高'],
        ['body', ['linePercent'], '行高'],
      ],
    },
  };
  function overrides(layer, key) {
    const entries = map[layer?.type]?.[key] || [];
    return entries.flatMap(([id, keys, label]) => {
      const part = layer.parts?.find((p) => p.id === id);
      if (!part || !keys.some((k) => !!part[k])) return [];
      return [{ id, name: part.name, keys, label, value: part[keys.find((k) => !!part[k])] }];
    });
  }
  function reset(layer, key, id) {
    const item = (map[layer?.type]?.[key] || []).find((v) => v[0] === id),
      part = layer.parts?.find((p) => p.id === id);
    if (!part || !item) return false;
    for (const key of item[1]) part[key] = key === 'color' ? '' : 0;
    return true;
  }
  const api = { overrides, reset };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeInheritance = api;
})(globalThis);
