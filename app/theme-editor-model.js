/* Portable theme documents. Pure data; imported documents never execute code. */
(function (root) {
  'use strict';
  // The local service reloads this schema while editing; refresh its data-only
  // keyframe schema together so newly exposed properties survive OBS export.
  if (typeof module === 'object' && module.exports)
    delete require.cache[require.resolve('./theme-keyframes.js')];
  if (typeof module === 'object' && module.exports)
    delete require.cache[require.resolve('./theme-scene-components.js')];
  const C =
    typeof module === 'object' && module.exports
      ? require('./theme-scene-components.js')
      : root.ThemeSceneComponents;
  const K =
    typeof module === 'object' && module.exports
      ? require('./theme-keyframes.js')
      : root.ThemeKeyframes;
  const builtin = [
    'chat',
    'background',
    'grain',
    'hiss',
    'game',
    'header',
    'host',
    'topic',
    'status',
    'logos',
    'timer',
    'music',
    'normal',
    'sc',
    'gift',
    'fleet',
  ];
  const labels = {
    chat: '组合弹幕区',
    resonance: '希斯流场',
    background: '画布背景',
    grain: '印刷颗粒',
    hiss: '希斯共振',
    game: '游戏窗口',
    header: '主播与标题',
    host: '主播名称',
    topic: '直播标题（备注）',
    status: '直播状态',
    logos: '中英双 Logo',
    timer: '直播计时',
    music: 'Now Playing',
    normal: '普通弹幕',
    sc: 'SC · 希斯',
    gift: '礼物 · 异化物档案',
    fleet: '上舰提示',
    text: '文字',
    image: '图片',
    video: '视频',
    shape: '色块',
    line: '线条',
    border: '框线',
    group: '图层组',
  };
  const fonts = {
    sans: '"Segoe UI","Microsoft YaHei",sans-serif',
    serif: 'Georgia,"Songti SC",SimSun,serif',
    condensed: '"Roboto Condensed","Arial Narrow","Microsoft YaHei",sans-serif',
    mono: 'Consolas,"Microsoft YaHei",monospace',
  };
  const num = (v, min, max, d) => Math.max(min, Math.min(max, Number.isFinite(+v) ? +v : d));
  const color = (v, d = '#eeeae1') => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
  // Embedded sources are immutable strings. Validate identical material once,
  // with a bounded LRU so discarded imports cannot retain unbounded memory.
  const sourceMemo = new Map(),
    sourceMemoLimit = 16 * 1024 * 1024;
  let sourceMemoCharacters = 0,
    sourceMemoHits = 0,
    sourceMemoChecks = 0;
  function rememberSource(s) {
    if (s.length < 4096) return;
    sourceMemo.set(s, true);
    sourceMemoCharacters += s.length;
    while (sourceMemo.size > 64 || sourceMemoCharacters > sourceMemoLimit) {
      const oldest = sourceMemo.keys().next().value;
      sourceMemoCharacters -= oldest.length;
      sourceMemo.delete(oldest);
    }
  }
  function source(v) {
    const s = String(v || '').trim();
    if (s.length > 12000000) return '';
    if (sourceMemo.has(s)) {
      sourceMemo.delete(s);
      sourceMemo.set(s, true);
      sourceMemoHits++;
      return s;
    }
    if (s.slice(0, 5).toLowerCase() === 'data:') {
      sourceMemoChecks++;
      if (/^data:(image\/(png|jpeg|webp|gif)|video\/(mp4|webm));base64,[a-z0-9+/=]+$/i.test(s)) {
        rememberSource(s);
        return s;
      }
      return '';
    }
    try {
      const u = new URL(s, 'http://127.0.0.1:8791/');
      return s && !s.startsWith('//') && ['http:', 'https:'].includes(u.protocol) ? s : '';
    } catch {
      return '';
    }
  }
  const partLabels = {
    image: '图片积木',
    page: '正文页码',
    card: 'SC 卡片底',
    label: '通讯标签',
    amount: 'SC 金额',
    progress: '倒计时流线',
    timer: '剩余时间',
    paper: '档案纸张',
    photo: '物证照片',
    quantity: '数量',
    value: '价值',
    note: '涂黑备注',
    badge: '舰队徽记',
    particles: '碎光发射器',
    title: '开通标题',
    signal: '信号三角',
    name: '用户名',
    body: '正文',
    divider: '分隔线',
    text: '文字积木',
    line: '线条积木',
    shape: '色块积木',
  };
  function normalizeParts(raw, type) {
    if (!['normal', 'fleet', 'gift', 'sc'].includes(type)) return [];
    const native =
        type === 'sc'
          ? [
              ['card', 'card'],
              ['signal', 'signal'],
              ['label', 'label'],
              ['name', 'name'],
              ['amount', 'amount'],
              ['body', 'body'],
              ['progress', 'progress'],
              ['timer', 'timer'],
              ['page', 'page'],
            ]
          : type === 'gift'
            ? [
                ['paper', 'paper'],
                ['photo', 'photo'],
                ['title', 'title'],
                ['name', 'name'],
                ['quantity', 'quantity'],
                ['value', 'value'],
                ['note', 'note'],
              ]
            : type === 'fleet'
              ? [
                  ['particles', 'particles'],
                  ['badge', 'badge'],
                  ['title', 'title'],
                  ['name', 'name'],
                ]
              : [
                  ['signal', 'signal'],
                  ['name', 'name'],
                  ['body', 'body'],
                  ['divider', 'divider'],
                ],
      list = Array.isArray(raw)
        ? raw.filter((p) => p && typeof p === 'object').slice(0, limits.parts)
        : [],
      used = new Set(),
      out = [];
    for (const [i, item] of [
      ...list.map((p) => ({ ...p, kind: native.find(([id]) => id === p.id)?.[1] || p.kind })),
      ...native
        .filter(([id]) => !list.some((p) => p.id === id))
        .map(([id, kind]) => ({ id, kind })),
    ]
      .slice(0, limits.parts)
      .entries()) {
      const kind = Object.hasOwn(partLabels, item.kind) ? item.kind : 'text',
        id = /^[a-z][a-z0-9-]{0,70}$/i.test(item.id) ? item.id : 'part-' + i;
      if (used.has(id)) continue;
      used.add(id);
      out.push({
        font: ['native', 'sans', 'serif', 'condensed', 'mono'].includes(item.font)
          ? item.font
          : 'native',
        linePercent: num(item.linePercent, 0, 250, 0),
        maxLines: Math.round(num(item.maxLines, 0, 20, 0)),
        overflow: item.overflow === 'clip' ? 'clip' : 'ellipsis',
        align: ['left', 'center', 'right'].includes(item.align) ? item.align : 'left',
        src: source(item.src),
        fit: ['contain', 'cover', 'fill'].includes(item.fit) ? item.fit : 'contain',
        imageMode: ['reveal', 'evidence', 'plain'].includes(item.imageMode)
          ? item.imageMode
          : 'reveal',
        grayscale: num(item.grayscale, 0, 1, 0),
        template: typeof item.template === 'string' ? item.template.slice(0, 1000) : null,
        tracks: K.normalize(item.tracks),
        exitTracks: ['fleet', 'gift', 'sc'].includes(type) ? K.normalize(item.exitTracks) : [],
        motionLoop: item.motionLoop === true,
        id,
        kind,
        name: String(
          type === 'gift' && kind === 'title' && (!item.name || item.name === '开通标题')
            ? '礼物标题'
            : type === 'gift' && kind === 'name' && !item.name
              ? '赠送者'
              : item.name || partLabels[kind],
        ).slice(0, 60),
        visible: item.visible !== false,
        locked: item.locked === true,
        placement: item.placement === 'free' ? 'free' : 'flow',
        x: num(item.x, -600, 1920, 0),
        y: num(item.y, -600, 1080, 0),
        w: num(item.w, 0, 1920, 0),
        h: num(
          item.h,
          ['paper', 'card'].includes(kind) ? 0 : 1,
          1080,
          ['paper', 'card'].includes(kind) ? 0 : 20,
        ),
        size: num(item.size, 0, ['badge', 'particles', 'photo'].includes(kind) ? 600 : 120, 0),
        weight: num(item.weight, 0, 900, 0),
        color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '',
        fill: color(item.fill, '#edecf1'),
        opacity: num(item.opacity, 0, 1, 1),
        strokeWidth: num(
          item.strokeWidth,
          0,
          12,
          kind === 'signal' ? 1.6 : kind === 'progress' ? 2.4 : 1,
        ),
        text: String(item.text || '新的通讯').slice(0, 1000),
        delay: num(item.delay, 0, 5000, 0),
      });
    }
    return out;
  }
  function resetPartStyle(part, type) {
    const keep = Object.fromEntries(
      ['id', 'kind', 'name', 'text', 'src', 'template', 'locked'].map((key) => [key, part[key]]),
    );
    return normalizeParts([keep], type).find((p) => p.id === part.id);
  }
  const variantKeys = [
    'tracks',
    'exitTracks',
    'motionLoop',
    'parts',
    'contentWidth',
    'align',
    'fontSize',
    'linePercent',
    'bodyWeight',
    'nameColor',
    'bodyColor',
    'titleSize',
    'nameSize',
    'nameWidth',
    'iconSize',
    'fxCustom',
    'fxSeeded',
    'scStrength',
    'scReach',
    'scWarp',
    'scRed',
    'scDispersion',
    'scGhost',
    'scSpeed',
    'effectScope',
    'effectX',
    'effectY',
    'effectW',
    'effectH',
    'effectGain',
    'particleAmount',
    'particleSpread',
    'vhsAmount',
    'animationCustom',
    'entranceDelay',
    'entranceMs',
    'animationEnabled',
    'curve',
  ];
  function variantNames(type) {
    return type === 'fleet'
      ? ['captain', 'admiral', 'governor']
      : type === 'sc'
        ? ['0', '1', '2', '3', '4', '5', '6']
        : [];
  }
  function componentSnapshot(l) {
    return structuredClone(Object.fromEntries(variantKeys.map((k) => [k, l[k]])));
  }
  const styleKeys = [...variantKeys, 'photoSize', 'paperPadding', 'paperColor', 'inkColor'];
  function makeStyle(l, name) {
    const values = Object.fromEntries(styleKeys.map((k) => [k, l[k]]));
    return {
      format: 'control-component-style',
      version: 1,
      type: l.type,
      name: String(name || labels[l.type] || '组件样式').slice(0, 60),
      style: structuredClone(values),
    };
  }
  function normalizeStyle(raw) {
    if (
      !raw ||
      raw.format !== 'control-component-style' ||
      raw.version !== 1 ||
      !['normal', 'sc', 'gift', 'fleet'].includes(raw.type) ||
      !raw.style ||
      typeof raw.style !== 'object'
    )
      return null;
    return makeStyle(layer({ ...raw.style, type: raw.type, variants: {} }), raw.name);
  }
  function normalizeVariants(raw, type, i) {
    const out = {};
    for (const key of variantNames(type)) {
      const v = raw.variants?.[key];
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const flat = Object.fromEntries(Object.entries(v).filter(([k]) => variantKeys.includes(k))),
        value = layer({ ...raw, ...flat, variants: {} }, i);
      out[key] = componentSnapshot(value);
    }
    return out;
  }
  function resolveComponent(l, data = {}) {
    if (!l) return l;
    const key =
      data.previewStyleKey === 'base'
        ? ''
        : (data.previewStyleKey ??
          (l.type === 'fleet' ? data.rank : l.type === 'sc' ? String(data.tier) : ''));
    return l.variants?.[key] ? { ...l, ...l.variants[key] } : l;
  }
  function positionRange(l, axis) {
    const length = axis === 'x' ? 1920 : 1080;
    return l.type === 'resonance' ? [-length, length] : [0, length - l[axis === 'x' ? 'w' : 'h']];
  }
  function splitHiss(doc, l) {
    const game = doc.layers.find(
        (item) => item.type === 'game' && effective(doc, item).visible,
      ) || { x: 18, y: 72, w: 0, h: 0 },
      boxes = [
        { x: game.x + game.w - 476, y: 0, w: 710, h: 420, ax: game.x + game.w + 7, ay: game.y + 1 },
        { x: 0, y: game.y + game.h - 164, w: 650, h: 360, ax: game.x, ay: game.y + game.h + 1 },
      ],
      sx = l.w / 1920,
      sy = l.h / 1080,
      a = (l.rotation * Math.PI) / 180,
      cos = Math.cos(a),
      sin = Math.sin(a);
    return boxes.map((b, i) => {
      const w = b.w * sx,
        h = b.h * sy,
        cx = (b.x + b.w / 2) * sx,
        cy = (b.y + b.h / 2) * sy;
      return layer({
        id: 'split-flow-' + i,
        type: 'resonance',
        name: i ? '希斯 · 左下流场' : '希斯 · 右上流场',
        x: l.x + cx * cos - cy * sin - w / 2,
        y: l.y + cx * sin + cy * cos - h / 2,
        w,
        h,
        anchorX: (b.ax - b.x) * sx,
        anchorY: (b.ay - b.y) * sy,
        variant: i,
        parent: l.parent,
        scope: l.scope,
        attach: l.attach,
        intensity: l.intensity,
        opacity: l.opacity,
        brightness: l.brightness,
        blend: l.blend,
        shadow: l.shadow,
        rotation: l.rotation,
        visible: l.visible,
      });
    });
  }
  function layer(raw = {}, i = 0) {
    const type = Object.hasOwn(labels, raw.type) ? raw.type : 'text';
    let w = num(raw.w, 2, 1920, 400),
      h = num(raw.h, 2, 1080, 90);
    if (type === 'game' || type === 'music') {
      w = Math.min(w, 1920);
      h = type === 'game' ? (w * 9) / 16 : (w * 7) / 24;
    }
    return {
      chatId: typeof raw.chatId === 'string' ? raw.chatId.slice(0, 71) : '',
      standalone: raw.standalone === true,
      messageFilter: (type === 'fleet'
        ? ['all', 'captain', 'admiral', 'governor']
        : type === 'sc'
          ? ['all', '0', '1', '2', '3', '4', '5', '6']
          : ['all']
      ).includes(raw.messageFilter)
        ? raw.messageFilter
        : 'all',
      ...C.normalize(raw, type),
      variants: normalizeVariants(raw, type, i),
      tracks: K.normalize(raw.tracks, K.componentProperties(type)),
      exitTracks: ['fleet', 'gift', 'sc'].includes(type)
        ? K.normalize(raw.exitTracks, K.componentProperties(type))
        : [],
      motionLoop: raw.motionLoop === true,
      parts: normalizeParts(raw.parts, type),
      id: /^[a-z][a-z0-9-]{0,70}$/i.test(raw.id) ? raw.id : 'layer-' + i,
      type,
      name: String(raw.name || labels[type]).slice(0, 60),
      x: num(raw.x, ...positionRange({ type, w, h }, 'x'), 80),
      y: num(raw.y, ...positionRange({ type, w, h }, 'y'), 80),
      w,
      h,
      visible: raw.visible !== false,
      locked: raw.locked === true,
      parent: typeof raw.parent === 'string' ? raw.parent : '',
      opacity: num(raw.opacity, 0, 1, 1),
      rotation: ['game', 'chat'].includes(type) ? 0 : num(raw.rotation, -180, 180, 0),
      blend: ['normal', 'screen', 'multiply', 'overlay', 'lighten'].includes(raw.blend)
        ? raw.blend
        : 'normal',
      text: String(raw.text ?? '新的通讯').slice(0, 3000),
      size: num(raw.size, 8, 240, 36),
      weight: num(raw.weight, 100, 900, 700),
      font: Object.hasOwn(fonts, raw.font) ? raw.font : 'sans',
      color: color(raw.color),
      fill: color(raw.fill, type === 'chat' ? '#0e100f' : '#111412'),
      panelOpacity: num(raw.panelOpacity, 0, 1, 1),
      panelGrain: num(raw.panelGrain, 0, 2, 1),
      stroke: color(raw.stroke, '#d4d2c4'),
      frameVisible: raw.frameVisible !== false,
      traceAmount: num(raw.traceAmount, 0, 1, 0),
      traceSpeed: num(raw.traceSpeed, 0.1, 3, 1),
      strokeWidth: num(raw.strokeWidth, 0, 24, type === 'border' ? 1.5 : 0),
      radius: num(raw.radius, 0, 200, 0),
      lineHeight: num(raw.lineHeight, 0.7, 3, 1.3),
      spacing: num(raw.spacing, -5, 30, 0),
      align: ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'left',
      src: source(raw.src),
      fit: ['cover', 'contain', 'fill'].includes(raw.fit) ? raw.fit : 'contain',
      shadow: num(raw.shadow, 0, 40, 0),
      brightness: num(raw.brightness, 0.2, 2, 1),
      mode: ['theme', 'color', 'image', 'video', 'transparent'].includes(raw.mode)
        ? raw.mode
        : 'theme',
      loop: raw.loop !== false,
      speed: num(raw.speed, 0.1, 3, 1),
      intensity: num(raw.intensity, 0, 100, 60),
      fontSize: num(raw.fontSize, 12, 60, 28),
      linePercent: num(raw.linePercent, 100, 220, 146),
      width: num(raw.width, 200, 1000, 456),
      bleed: num(raw.bleed, 0, 180, 80),
      bodyWeight: num(raw.bodyWeight, 300, 900, 600),
      nameColor: color(raw.nameColor, '#b8bcb5'),
      bodyColor: color(raw.bodyColor, '#e5e8e0'),
      titleSize: num(raw.titleSize, 20, 80, 46),
      nameSize: num(raw.nameSize, 18, 64, 34),
      nameWidth: num(raw.nameWidth, 160, 800, 460),
      fxCustom: raw.fxCustom === true,
      fxSeeded:
        raw.fxSeeded === true ||
        raw.fxCustom === true ||
        (raw.fxSeeded === undefined &&
          Object.entries({
            scStrength: 46,
            scReach: 68,
            scWarp: 40,
            scRed: 62,
            scDispersion: 34,
            scGhost: 20,
            scSpeed: 36,
          }).some(([k, v]) => Number.isFinite(+raw[k]) && +raw[k] !== v)),
      scStrength: num(raw.scStrength, 0, 100, 46),
      scReach: num(raw.scReach, 12, 140, 68),
      scWarp: num(raw.scWarp, 0, 100, 40),
      scRed: num(raw.scRed, 0, 100, 62),
      scDispersion: num(raw.scDispersion, 0, 100, 34),
      scGhost: num(raw.scGhost, 0, 100, 20),
      scSpeed: num(raw.scSpeed, 0, 100, 36),
      scope: raw.scope === 'chat' ? 'chat' : 'scene',
      attach: raw.attach === 'chat' ? 'chat' : '',
      pixelLayout: true,
      paddingX: num(raw.paddingX, 0, 120, 27),
      paddingTop: num(raw.paddingTop, 0, 300, 102),
      paddingBottom: num(raw.paddingBottom, 0, 160, 12),
      messageGap: num(raw.messageGap, 0, 120, 0),
      contentWidth: num(raw.contentWidth, 0, 1800, 0),
      iconSize: num(raw.iconSize, 48, 600, 210),
      photoSize: num(raw.photoSize, 48, 300, 110),
      paperPadding: num(raw.paperPadding, 4, 80, 16),
      paperColor: color(raw.paperColor, '#e9e9e2'),
      inkColor: color(raw.inkColor, '#151615'),
      effectScope: ['component', 'chat', 'scene', 'custom'].includes(raw.effectScope)
        ? raw.effectScope
        : 'chat',
      effectX: num(raw.effectX, -1920, 1920, 0),
      effectY: num(raw.effectY, -1080, 1080, 0),
      effectW: num(raw.effectW, 32, 1920, 458),
      effectH: num(raw.effectH, 32, 1080, 908),
      effectGain: num(raw.effectGain, 0, 3, 1),
      particleAmount: num(raw.particleAmount, 0, 2, 1),
      particleSpread: num(raw.particleSpread, 0.2, 3, 1),
      vhsAmount: num(raw.vhsAmount, 0, 3, 1),
      anchorX: num(raw.anchorX, 0, 1920, w * 0.5),
      anchorY: num(raw.anchorY, 0, 1080, h * 0.5),
      audioGain: num(raw.audioGain, 0, 3, 1),
      avoidGame: raw.avoidGame !== false,
      flowDensity: num(raw.flowDensity, 0.1, 3, 1),
      flowWarp: num(raw.flowWarp, 0, 3, 1),
      flowSpread: num(raw.flowSpread, 0.2, 3, 1),
      flowColor: color(raw.flowColor, '#b80504'),
      variant: num(raw.variant, 0, 1, 0),
      cornerLength: num(raw.cornerLength, 0, 120, 20),
      cornerInset: num(raw.cornerInset, 0, 60, 12),
      borderStyle: ['solid', 'dashed', 'double', 'corners'].includes(raw.borderStyle)
        ? raw.borderStyle
        : 'solid',
      grainAmount: num(raw.grainAmount, 0, 1, 0.25),
      animationCustom: raw.animationCustom === true,
      entranceDelay: num(raw.entranceDelay, 0, 5000, 0),
      entranceMs: num(raw.entranceMs, 0, 20000, 0),
      animationEnabled: raw.animationEnabled !== false,
      curve:
        Array.isArray(raw.curve) && raw.curve.length === 4
          ? raw.curve.map((n, i) => num(n, 0, 1, [0, 0, 1, 1][i]))
          : [0, 0, 1, 1],
    };
  }
  function normalize(raw = {}) {
    if (!raw || typeof raw !== 'object') raw = {};
    const seen = new Set(),
      types = new Set(),
      layers = [];
    for (const [i, item] of (Array.isArray(raw.layers)
      ? raw.layers.slice(0, limits.layers)
      : []
    ).entries()) {
      if (!item) continue;
      const l = layer(item, i);
      if (l.type === 'chat' && (raw.editorVersion ?? 0) <= 96 && l.fill === '#111412')
        l.fill = '#0e100f';
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      types.add(l.type);
      layers.push(l);
    }
    const rootIndex = layers.findIndex((l) => l.type === 'chat'),
      firstChild = layers.findIndex((l) => l.scope === 'chat');
    if (rootIndex >= 0 && firstChild >= 0 && rootIndex > firstChild) {
      const [root] = layers.splice(rootIndex, 1);
      layers.splice(firstChild, 0, root);
    }
    for (const l of layers) {
      if (!layers.some((p) => p.id === l.parent && p.type === 'group') || l.type === 'group')
        l.parent = '';
    }
    for (const group of layers.filter((l) => l.type === 'group')) {
      const children = layers.filter((l) => l.parent === group.id);
      if (children.length) Object.assign(group, bounds(children));
    }
    const settings = {};
    for (const [k, v] of Object.entries(raw.settings || {})) {
      if (
        /^[a-zA-Z][a-zA-Z0-9-]{0,50}$/.test(k) &&
        !/^live[A-Z]/.test(k) && k !== 'messageSource' &&
        ['string', 'number', 'boolean'].includes(typeof v)
      )
        settings[k] = typeof v === 'string' ? v.slice(0, 500) : v;
    }
    return {
      format: 'control-theme',
      version: 1,
      editorVersion: 156,
      composition: raw.composition === 'feed' ? 'feed' : 'layers',
      name: String(raw.name || '我的控制主题').slice(0, 80),
      width: 1920,
      height: 1080,
      layers,
      settings,
    };
  }
  function create(preset = 'classic', old) {
    const positions =
      preset === 'split'
        ? {
            game: [0, 0, 1920, 1080],
            header: [1403, 20, 485, 33],
            logos: [1528, 64, 360, 34],
            timer: [40, 1008, 400, 43],
            music: [42, 622, 400, 116.667],
            normal: [1568, 144, 324, 348],
            sc: [1554, 510, 354, 290],
            gift: [36, 800, 326, 172],
            fleet: [640, 40, 640, 450],
          }
        : preset === 'game'
          ? {
              game: [18, 62, 1632, 918],
              header: [32, 10, 1852, 40],
              logos: [490, 1006, 580, 48],
              timer: [34, 1013, 400, 34],
              music: [44, 1000, 270, 78.75],
              normal: [1672, 122, 224, 410],
              sc: [1668, 540, 234, 245],
              gift: [1668, 790, 234, 166],
              fleet: [620, 35, 640, 450],
            }
          : {
              game: [18, 72, 1408, 792],
              header: [32, 12, 1852, 42],
              logos: [34, 967, 1100, 74],
              timer: [35, 903, 470, 45],
              music: [34, 900, 530, 154.58],
              normal: [1454, 168, 436, 294],
              sc: [1454, 462, 436, 270],
              gift: [1460, 738, 422, 220],
              fleet: [405, 50, 640, 450],
            };
    const base = [
      {
        id: 'background',
        type: 'background',
        x: 0,
        y: 0,
        w: 1920,
        h: 1080,
        locked: true,
        mode: preset === 'split' ? 'transparent' : 'theme',
        fill: '#0d100f',
      },
      { id: 'game', type: 'game', src: 'live-game.jpg', strokeWidth: 1.5 },
      {
        id: 'grain',
        type: 'grain',
        x: 0,
        y: 0,
        w: 1920,
        h: 1080,
        locked: true,
        visible: preset !== 'split',
        opacity: 1,
      },
      {
        id: 'hiss',
        type: 'hiss',
        x: 0,
        y: 0,
        w: 1920,
        h: 1080,
        locked: true,
        visible: preset !== 'split',
      },
      ...['header', 'logos', 'timer', 'music', 'normal', 'sc', 'gift', 'fleet'].map((type) => ({
        id: type,
        type,
        visible: type !== 'music' && !(preset === 'split' && type === 'timer'),
      })),
      {
        id: 'chat-title',
        type: 'text',
        name: '通讯标题',
        x: 1470,
        y: 95,
        w: 380,
        h: 60,
        text: '通讯记录',
        size: 42,
        weight: 800,
        visible: preset === 'classic',
      },
      {
        id: 'chat-rule',
        type: 'line',
        name: '通讯红线',
        x: 1470,
        y: 152,
        w: 176,
        h: 4,
        fill: '#d13e3e',
        visible: preset === 'classic',
      },
    ];
    for (const item of base) {
      if (positions[item.type]) {
        [item.x, item.y, item.w, item.h] = positions[item.type];
      }
      if (old?.elements?.[item.type]) {
        Object.assign(item, old.elements[item.type]);
        item.visible = old.elements[item.type].enabled;
      }
      if (['normal', 'sc', 'gift', 'fleet'].includes(item.type)) {
        item.width = item.type === 'gift' ? 516 : item.type === 'sc' ? 416 : 456;
        item.bleed = item.type === 'sc' ? 0 : 100;
      }
    }
    if (old?.extras)
      for (const item of old.extras) base.push({ ...item, visible: item.enabled !== false });
    const combined = preset === 'classic' || preset === 'game';
    const cr = preset === 'game' ? [1668, 62, 234, 918] : [1444, 72, 458, 908];
    if (combined) {
      base.push({
        id: 'chat',
        type: 'chat',
        x: cr[0],
        y: cr[1],
        w: cr[2],
        h: cr[3],
        paddingTop: preset === 'game' ? 72 : 102,
        paddingX: preset === 'game' ? 14 : 27,
      });
      base.push({
        id: 'chat-border',
        type: 'border',
        name: '弹幕区边框',
        x: cr[0],
        y: cr[1],
        w: cr[2],
        h: cr[3],
        scope: 'chat',
        attach: 'chat',
        stroke: '#92968b',
        strokeWidth: 1.5,
      });
      for (const item of base)
        if (['normal', 'sc', 'gift', 'fleet'].includes(item.type)) {
          item.scope = 'chat';
          item.fontSize = preset === 'game' ? 24 : 28;
          item.contentWidth = 0;
          item.effectScope = 'chat';
          if (item.type === 'gift') {
            item.fontSize = 20;
            item.titleSize = 26;
          }
          if (item.type === 'fleet') {
            item.titleSize = 32;
            item.nameSize = 28;
          }
        }
      const title = base.find((l) => l.id === 'chat-title'),
        rule = base.find((l) => l.id === 'chat-rule');
      Object.assign(title, {
        x: cr[0] + 26,
        y: cr[1] + 20,
        w: cr[2] - 52,
        h: 55,
        visible: true,
        scope: 'chat',
        attach: 'chat',
        size: preset === 'game' ? 30 : 39,
      });
      Object.assign(rule, {
        x: cr[0] + 26,
        y: cr[1] + 79,
        w: Math.min(176, cr[2] - 52),
        visible: preset !== 'game',
        scope: 'chat',
        attach: 'chat',
      });
      base.find((l) => l.type === 'fleet').iconSize = preset === 'game' ? 142 : 230;
    }
    if (combined) {
      const g = base.find((l) => l.type === 'game'),
        at = base.findIndex((l) => l.type === 'hiss');
      base[at].visible = false;
      base.splice(
        at + 1,
        0,
        {
          id: 'flow-top',
          type: 'resonance',
          name: '希斯 · 右上流场',
          x: g.x + g.w - 476,
          y: 0,
          w: 710,
          h: 420,
          anchorX: 483,
          anchorY: g.y + 1,
          intensity: 60,
        },
        {
          id: 'flow-bottom',
          type: 'resonance',
          name: '希斯 · 左下流场',
          x: 0,
          y: g.y + g.h - 164,
          w: 650,
          h: 360,
          anchorX: g.x,
          anchorY: 165,
          variant: 1,
          intensity: 60,
        },
      );
    }
    // Fresh presets use independently placeable HUD blocks. Imported legacy
    // headers remain intact and can be detached explicitly in the editor.
    if (!old?.elements?.header) {
      const headerIndex = base.findIndex(l => l.type === 'header');
      const split = preset === 'split', game = preset === 'game';
      base.splice(headerIndex, 1,
        { id: 'host', type: 'host', x: split ? 1460 : 32, y: split ? 20 : 12,
          w: split ? 312 : 345, h: split ? 33 : 42,
          headerHostSize: split ? 23 : game ? 30 : 35, headerWeight: 750,
          headerGap: split ? 17 : 24 },
        { id: 'topic', type: 'topic', x: split ? 1360 : 406, y: split ? 106 : 12,
          w: split ? 528 : 1100, h: split ? 34 : 42,
          headerTopicSize: split ? 23 : 27, headerWeight: 750,
          headerTopicPadding: 30, visible: !split },
        { id: 'status', type: 'status', x: split ? 1790 : 1756, y: split ? 20 : 12,
          w: split ? 98 : 128, h: split ? 33 : 42,
          headerStatusSize: split ? 20 : 24, headerWeight: 650 },
      );
    }
    return normalize({
      editorVersion: 156,
      composition: combined ? 'feed' : 'layers',
      name:
        '控制共振 · ' +
        ({ classic: '完整主题', game: '游戏优先', split: '全屏分区', custom: '自定义' }[preset] ||
          '自定义'),
      layers: base,
    });
  }
  function effective(doc, l) {
    const group = doc.layers.find((x) => x.id === l.parent);
    return {
      ...l,
      visible: l.visible && group?.visible !== false,
      locked: l.locked || group?.locked === true,
      opacity: l.opacity * (group?.opacity ?? 1),
    };
  }
  function detachHeader(l, boxes = {}) {
    const enabled = { host: l.headerHostVisible, topic: l.headerTopicVisible, status: l.headerStatusVisible };
    return ['host', 'topic', 'status', 'rule', 'divider'].flatMap((type, i) => {
      if (['rule', 'divider'].includes(type) && !boxes[type]) return [];
      const rect = boxes[type] || { x: l.x, y: l.y, w: Math.min(l.w, type === 'topic' ? 600 : 320), h: l.h };
      return [layer({
        ...l, ...rect, id: l.id + '-' + type,
        type: ['rule', 'divider'].includes(type) ? 'line' : type,
        name: labels[type] || (type === 'rule' ? '标题栏底线' : '标题栏分隔线'),
        visible: l.visible && (enabled[type] ?? true),
        fill: '#92968b', strokeWidth: 0,
      }, i)];
    });
  }
  function bounds(layers) {
    if (!layers.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(...layers.map((l) => l.x)),
      y = Math.min(...layers.map((l) => l.y));
    return {
      x,
      y,
      w: Math.max(...layers.map((l) => l.x + l.w)) - x,
      h: Math.max(...layers.map((l) => l.y + l.h)) - y,
    };
  }
  function custom(doc) {
    const elements = {};
    for (const type of [
      'game',
      'header',
      'logos',
      'timer',
      'music',
      'normal',
      'sc',
      'gift',
      'fleet',
    ]) {
      const item = doc.layers.find((l) => l.type === type);
      elements[type] = item
        ? {
            ...effective(doc, item),
            enabled: effective(doc, item).visible,
            fontSize: item.fontSize,
            lineHeight: item.linePercent,
          }
        : { enabled: false };
    }
    const chat = doc.layers.find((l) => l.type === 'chat');
    return {
      version: 1,
      elements,
      extras: [],
      composition: doc.composition,
      chat: chat ? effective(doc, chat) : null,
    };
  }
  const limits = Object.freeze({ layers: 100, parts: 28 });
  function capacityIssue(doc) {
    if (doc?.layers?.length > limits.layers)
      return '主题超过 ' + limits.layers + ' 个图层，未导入；请先在原文件中精简图层。';
    for (const l of doc?.layers || []) {
      for (const s of [l, ...Object.values(l?.variants || {})])
        if (s?.parts?.length > limits.parts)
          return (
            (l.name || labels[l.type] || '组件') +
            ' 超过 ' +
            limits.parts +
            ' 个部件，未导入；请先精简部件。'
          );
    }
    return '';
  }
  const api = {
    limits,
    capacityIssue,
    positionRange,
    splitHiss,
    detachHeader,
    get sourceCacheStats() {
      return {
        entries: sourceMemo.size,
        characters: sourceMemoCharacters,
        limit: sourceMemoLimit,
        hits: sourceMemoHits,
        checks: sourceMemoChecks,
      };
    },
    styleKeys,
    makeStyle,
    normalizeStyle,
    variantKeys,
    variantNames,
    componentSnapshot,
    resolveComponent,
    normalizeParts,
    resetPartStyle,
    partLabels,
    builtin,
    labels,
    fonts,
    num,
    source,
    normalize,
    create,
    effective,
    bounds,
    custom,
    layer,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeEditorModel = api;
})(typeof window === 'object' ? window : globalThis);
