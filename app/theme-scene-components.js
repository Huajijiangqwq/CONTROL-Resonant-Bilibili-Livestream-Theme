/* Native HUD controls: alter typography and layout without replacing animated nodes. */
(function (root) {
  'use strict';
  const n = (key, label, def, min, max, step = 1) => ({
      key,
      label,
      type: 'number',
      default: def,
      min,
      max,
      step,
    }),
    b = (key, label) => ({ key, label, type: 'checkbox', default: true });
  const schema = {
    header: [
      b('headerHostVisible', '显示主播名'),
      b('headerTopicVisible', '显示直播标题'),
      b('headerStatusVisible', '显示直播状态'),
      b('headerMarkVisible', '显示三角'),
      b('headerRuleVisible', '显示底线'),
      b('headerDividerVisible', '显示分隔线'),
      n('headerHostSize', '主播名字号 · 0 原版', 0, 0, 120),
      n('headerTopicSize', '标题字号 · 0 原版', 0, 0, 120),
      n('headerStatusSize', '状态字号 · 0 原版', 0, 0, 100),
      n('headerWeight', '文字字重 · 0 原版', 0, 0, 900, 100),
      n('headerGap', '元素间距', 24, 0, 160),
      n('headerTopicPadding', '白框左右留白', 30, 0, 100),
      n('headerTopicWidth', '标题最大宽度 · 0 原版', 0, 0, 1920),
      { key: 'headerWrap', label: '允许标题栏换行', type: 'checkbox', default: false },
    ],
    timer: [
      b('timerIconVisible', '显示时钟图标'),
      b('timerLabelVisible', '显示计时标签'),
      { key: 'timerLabelText', label: '计时标签', type: 'text', default: '直播时长' },
      n('timerLabelSize', '标签字号 · 0 原版', 0, 0, 120),
      n('timerDigitsSize', '数字字号 · 0 原版', 0, 0, 120),
      n('timerIconSize', '图标尺寸 · 0 原版', 0, 0, 120),
      n('timerWeight', '文字字重 · 0 原版', 0, 0, 900, 100),
      n('timerGap', '元素间距', 12, 0, 160),
      {
        key: 'timerDirection',
        label: '排列方向',
        type: 'select',
        default: 'row',
        options: [
          ['row', '横向'],
          ['column', '纵向'],
        ],
      },
      {
        key: 'timerAlign',
        label: '内容对齐',
        type: 'select',
        default: 'left',
        options: [
          ['left', '左侧'],
          ['center', '居中'],
          ['right', '右侧'],
        ],
      },
    ],
    logos: [
      b('logoEnglishVisible', '显示英文 Logo'),
      b('logoChineseVisible', '显示中文 Logo'),
      b('logoDividerVisible', '显示分隔线'),
      b('logoSignalVisible', '显示底部信号'),
      n('logoEnglishHeight', '英文字标高度', 74, 4, 240, 0.5),
      n('logoChineseHeight', '中文字标高度', 82, 4, 240, 0.5),
      n('logoEnglishGap', '英文词间距', 30, 0, 200, 0.5),
      n('logoChineseGap', '中文词间距', 24, 0, 200, 0.5),
      n('logoGap', '中英文间距', 57.5, 0, 400, 0.5),
      n('logoDividerLength', '分隔线长度 · 0 自动', 0, 0, 900),
      n('logoDividerWidth', '分隔线粗细', 1, 0, 12, 0.25),
      {
        key: 'logoDirection',
        label: '中英文排列',
        type: 'select',
        default: 'row',
        options: [
          ['row', '左右排列'],
          ['column', '上下排列'],
        ],
      },
      {
        key: 'logoOrder',
        label: '字标顺序',
        type: 'select',
        default: 'english',
        options: [
          ['english', '英文在前'],
          ['chinese', '中文在前'],
        ],
      },
      {
        key: 'logoAlign',
        label: '水平对齐',
        type: 'select',
        default: 'left',
        options: [
          ['left', '左侧'],
          ['center', '居中'],
          ['right', '右侧'],
        ],
      },
      {
        key: 'logoVerticalAlign',
        label: '垂直对齐',
        type: 'select',
        default: 'center',
        options: [
          ['top', '顶部'],
          ['center', '居中'],
          ['bottom', '底部'],
        ],
      },
    ],
  };
  const headerTypes = ['header', 'host', 'topic', 'status'];
  const isHeader = (type) => headerTypes.includes(type);
  const headerFields = {
    host: ['headerHostVisible', 'headerMarkVisible', 'headerHostSize', 'headerWeight', 'headerGap'],
    topic: ['headerTopicVisible', 'headerTopicSize', 'headerWeight', 'headerTopicPadding', 'headerTopicWidth'],
    status: ['headerStatusVisible', 'headerStatusSize', 'headerWeight'],
  };
  for (const [type, keys] of Object.entries(headerFields))
    schema[type] = schema.header.filter(s => keys.includes(s.key));
  function normalize(raw, type) {
    const out = {},
      height = Number.isFinite(+raw.h) ? Math.max(2, Math.min(1080, +raw.h)) : 90;
    if (isHeader(type) || type === 'timer')
      out.hudScale =
        Number.isFinite(+raw.hudScale) && raw.hudScale !== null
          ? Math.max(0.02, Math.min(33, +raw.hudScale))
          : height / (isHeader(type) ? 33 : 43);
    const logoScale = Math.min((Number.isFinite(+raw.w) ? +raw.w : 1350) / 1350, height / 90),
      scaled = new Set([
        'logoEnglishHeight',
        'logoChineseHeight',
        'logoEnglishGap',
        'logoChineseGap',
        'logoGap',
        'logoDividerWidth',
      ]);
    for (const spec of schema[type] || []) {
      const v = raw[spec.key],
        fallback =
          spec.key === 'timerGap'
            ? Math.min(160, 12 * out.hudScale)
            : scaled.has(spec.key)
              ? spec.default * logoScale
              : spec.default;
      out[spec.key] =
        spec.type === 'checkbox'
          ? typeof v === 'boolean'
            ? v
            : spec.default
          : spec.type === 'number'
            ? Math.max(
                spec.min,
                Math.min(spec.max, v !== '' && v != null && Number.isFinite(+v) ? +v : fallback),
              )
            : spec.type === 'select'
              ? spec.options.some(([k]) => k === v)
                ? v
                : spec.default
              : typeof v === 'string'
                ? v.slice(0, 80)
                : spec.default;
    }
    return out;
  }
  function logoMetrics(l) {
    const ew = ((390 + 437) * l.logoEnglishHeight) / 74 + l.logoEnglishGap,
      eh = l.logoEnglishHeight,
      cw = ((175 + 178) * l.logoChineseHeight) / 82 + l.logoChineseGap,
      ch = l.logoChineseHeight;
    const groups = [
        ...(l.logoEnglishVisible ? [{ w: ew, h: eh }] : []),
        ...(l.logoChineseVisible ? [{ w: cw, h: ch }] : []),
      ],
      vertical = l.logoDirection === 'column',
      divider = groups.length === 2 && l.logoDividerVisible && l.logoDividerWidth > 0;
    const dividerLength =
      l.logoDividerLength ||
      (vertical ? Math.max(ew, cw) * 0.6 : (Math.max(...groups.map((g) => g.h), 0) * 89) / 82);
    const items = [
      ...groups,
      ...(divider
        ? [
            {
              w: vertical ? dividerLength : l.logoDividerWidth,
              h: vertical ? l.logoDividerWidth : dividerLength,
            },
          ]
        : []),
    ];
    const gap = Math.max(0, items.length - 1) * l.logoGap;
    return {
      ew,
      eh,
      cw,
      ch,
      divider,
      dividerLength,
      w: vertical
        ? Math.max(...items.map((g) => g.w), 0)
        : items.reduce((v, g) => v + g.w, 0) + gap,
      h: vertical
        ? items.reduce((v, g) => v + g.h, 0) + gap
        : Math.max(...items.map((g) => g.h), 0),
    };
  }
  function applyLogos(el, l) {
    const lock = el.querySelector('.control-logo-lockup');
    if (!lock) return;
    const m = logoMetrics(l),
      vertical = l.logoDirection === 'column',
      align = { left: 'flex-start', center: 'center', right: 'flex-end' }[l.logoAlign],
      valign = { top: 'flex-start', center: 'center', bottom: 'flex-end' }[l.logoVerticalAlign];
    Object.assign(lock.style, {
      left: '0px',
      top: '0px',
      width: '100%',
      height: '100%',
      transform: 'none',
      flexDirection: l.logoDirection,
      justifyContent: vertical ? valign : align,
      alignItems: vertical ? align : valign,
      gap: l.logoGap + 'px',
    });
    for (const [name, show, height, gap, metrics] of [
      [
        'english',
        l.logoEnglishVisible,
        l.logoEnglishHeight,
        l.logoEnglishGap,
        [[390, 72], [437, 74], 74],
      ],
      [
        'chinese',
        l.logoChineseVisible,
        l.logoChineseHeight,
        l.logoChineseGap,
        [[175, 82], [178, 79.5], 82],
      ],
    ]) {
      const group = lock.querySelector('.' + name);
      if (!group) continue;
      group.classList.toggle('scene-part-hidden', !show);
      Object.assign(group.style, {
        gap: gap + 'px',
        height: height + 'px',
        flex: 'none',
        order: l.logoOrder === name ? '0' : '2',
      });
      group
        .querySelectorAll('svg')
        .forEach((svg, i) =>
          Object.assign(svg.style, {
            width: (metrics[i][0] * height) / metrics[2] + 'px',
            height: (metrics[i][1] * height) / metrics[2] + 'px',
          }),
        );
    }
    const divider = lock.querySelector('.logo-divider');
    divider.classList.toggle('scene-part-hidden', !m.divider);
    Object.assign(divider.style, {
      order: '1',
      width: (vertical ? m.dividerLength : l.logoDividerWidth) + 'px',
      height: (vertical ? l.logoDividerWidth : m.dividerLength) + 'px',
    });
    el.querySelector('.logo-signal')?.classList.toggle('scene-part-hidden', !l.logoSignalVisible);
    el.dataset.logoContentWidth = m.w.toFixed(2);
    el.dataset.logoContentHeight = m.h.toFixed(2);
    el.setAttribute(
      'aria-label',
      [l.logoEnglishVisible ? 'CONTROL RESONANT' : '', l.logoChineseVisible ? '控制 共振' : '']
        .filter(Boolean)
        .join(' · ') || 'Logo 已隐藏',
    );
  }
  function apply(el, l) {
    if (!schema[l.type]) return;
    if (l.type === 'logos') {
      applyLogos(el, l);
      return;
    }
    const get = (s) =>
        el.querySelector(s[0] === '#' ? '[data-native-id="' + s.slice(1) + '"]' : s) ||
        el.querySelector(s),
      show = (s, on) => get(s)?.classList.toggle('scene-part-hidden', !on),
      style = (s, key, value) => {
        const e = get(s);
        if (e) e.style[key] = value;
      },
      size = (v) => (v > 0 ? v + 'px' : '');
    // Freeze the imported native text unit; resizing the container must not
    // silently alter inherited font or icon sizes through legacy layout CSS.
    el.style.setProperty(
      isHeader(l.type) ? '--custom-header-scale' : '--custom-timer-scale',
      l.hudScale,
    );
    if (isHeader(l.type)) {
      for (const [s, k] of [
        ['#hostText', 'headerHostVisible'],
        ['#topicText', 'headerTopicVisible'],
        ['.on-air', 'headerStatusVisible'],
        ['.header-triangle', 'headerMarkVisible'],
        ['.header-rule', 'headerRuleVisible'],
      ])
        show(s, l[k]);
      show(
        '.header-separator',
        l.headerDividerVisible && l.headerHostVisible && l.headerTopicVisible,
      );
      for (const [s, key] of [
        ['#hostText', 'headerHostSize'],
        ['#topicText', 'headerTopicSize'],
        ['.on-air', 'headerStatusSize'],
      ]) {
        style(s, 'fontSize', size(l[key]));
        style(s, 'lineHeight', l[key] > 0 ? '1.3' : '');
        style(s, 'fontWeight', l.headerWeight > 0 ? String(l.headerWeight) : '');
      }
      el.style.gap = (l.headerGap ?? 0) + 'px';
      el.style.flexWrap = l.headerWrap ? 'wrap' : 'nowrap';
      el.style.alignContent = 'center';
      style('#topicText', 'maxWidth', size(l.headerTopicWidth));
      style('#topicText', 'paddingLeft', (l.headerTopicPadding ?? 0) + 'px');
      style('#topicText', 'paddingRight', (l.headerTopicPadding ?? 0) + 'px');
    } else {
      const label = get(':scope>span'),
        clock = get('svg');
      if (label) {
        label.classList.toggle('scene-part-hidden', !l.timerLabelVisible);
        if (label.textContent !== l.timerLabelText) label.textContent = l.timerLabelText;
        label.style.fontSize = size(l.timerLabelSize);
        label.style.fontWeight = l.timerWeight > 0 ? String(l.timerWeight) : '';
        label.style.whiteSpace = 'nowrap';
      }
      show('svg', l.timerIconVisible);
      if (clock) {
        clock.style.width = size(l.timerIconSize);
        clock.style.height = size(l.timerIconSize);
        clock.style.flexShrink = '0';
      }
      style('time', 'fontSize', size(l.timerDigitsSize));
      style('time', 'fontWeight', l.timerWeight > 0 ? String(l.timerWeight) : '');
      style('time', 'whiteSpace', 'nowrap');
      el.style.gap = l.timerGap + 'px';
      el.style.flexDirection = l.timerDirection;
      const align = { left: 'flex-start', center: 'center', right: 'flex-end' }[l.timerAlign];
      el.style.justifyContent = l.timerDirection === 'row' ? align : 'center';
      el.style.alignItems = l.timerDirection === 'row' ? 'center' : align;
    }
  }
  const api = { schema, normalize, apply, logoMetrics, isHeader };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeSceneComponents = api;
})(globalThis);
