(() => {
  'use strict';
  const embedded = new URLSearchParams(location.search).get('embed') === 'main';
  const viewKey = new URLSearchParams(location.search).get('themeInstance') || '',
    renderer = () =>
      embedded ? parent.ThemeRenderer?.forInstance?.(viewKey) || parent.ThemeRenderer : null;
  const editorDoc = () => renderer()?.value,
    combinedChat = () => editorDoc()?.composition === 'feed',
    component = (kind, m) => {
      const l = editorDoc()?.layers.find((l) => l.type === kind);
      return m && l ? parent.ThemeEditorModel.resolveComponent(l, m) : l;
    },
    componentVisible = (kind) => {
      const d = editorDoc(),
        l = component(kind);
      if (!d) return true;
      const chat = d.composition === 'feed' ? component('chat') : null;
      if (
        d.composition === 'feed' &&
        (!chat || !parent.ThemeEditorModel.effective(d, chat).visible)
      )
        return false;
      return !!l && parent.ThemeEditorModel.effective(d, l).visible;
    };
  let presentation = 'classic',
    presentationMotion = { phase: 'idle', progress: 1 };
  const split = () => embedded && ['split', 'custom'].includes(presentation) && !combinedChat(),
    floating = split,
    chatSurface = () => (combinedChat() ? component('chat') : null),
    transparentInk = () => floating() || (chatSurface()?.panelOpacity ?? 1) < 1,
    inkBackground = () => chatSurface()?.fill || '#0e100f',
    compact = () => embedded && presentation === 'game';
  let noticeSettings = NoticeLifetime.normalize();
  let embedFPS = 60;
  const frameGate = FrameRate.gate();
  if (embedded) frameGate.getLimit = () => embedFPS;
  const $ = (id) => document.getElementById(id);
  let canvas = $('stream'),
    ctx = canvas.getContext('2d', { alpha: true });
  const noticeAssetDeadline = performance.now() + 1500;
  // A seeded preview skips entrance animation, so its first frame must already
  // have the photograph, fleet materials and font metrics. Real messages keep
  // their existing independent queue and are never blocked by this preview gate.
  let demoGeneration = 0, demoAssetsReady = false;
  const demoAssets = Promise.allSettled([
    GiftNotice.loading, FleetNotice.loading, document.fonts.ready,
  ]).then(() => { demoAssetsReady = true; });
  const family = '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif';
  function setText(id, value) {
    const el = $(id);
    if (el.textContent !== value) el.textContent = value;
  }
  const tiers = [
    { amount: 2, fx: [24, 44, 28, 48, 24, 9, 28] },
    { amount: 30, fx: [32, 54, 33, 56, 28, 13, 30] },
    { amount: 50, fx: [39, 62, 37, 60, 32, 17, 33] },
    { amount: 100, fx: [46, 68, 40, 62, 34, 20, 36] },
    { amount: 500, fx: [60, 85, 43, 72, 43, 29, 39] },
    { amount: 1000, fx: [74, 106, 46, 83, 52, 39, 42] },
    { amount: 2000, fx: [88, 126, 48, 92, 62, 49, 45] },
  ];
  const fxKeys = ['strength', 'reach', 'textWarp', 'red', 'dispersion', 'ghost', 'speed'];
  const preset = (tier) => Object.fromEntries(fxKeys.map((k, i) => [k, tiers[tier].fx[i]]));
  if (embedded)
    window.SCNativePresets = {
      get: (tier) => preset(Math.max(0, Math.min(6, Math.round(Number(tier) || 0)))),
    };
  const clamp = (v, a, b, def = a) =>
    Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Number(v))) : def;
  let layout = { width: 440, fontSize: 21, lineHeight: 158, quality: 1.5 },
    draftKind = 'normal',
    drafts = {
      gift: '',
      fleet: '',
      normal: '欢迎来到太古屋',
      sc: '这套直播间太有感觉了！\n祝今晚探索顺利，前面有希斯，小心。',
    },
    selectedFx = preset(3),
    scDuration = 180;
  let imported = {},
    messages = [],
    queue = [],
    clock = 0,
    last = 0,
    lastDraw = -100,
    id = 0,
    worldBase = 0,
    camera = 0,
    cameraTarget = 0,
    following = true,
    paused = false,
    auto = false,
    nextAuto = 0,
    nextRelease = 0,
    lastSC = -2000,
    noticeReadyAt = 0,
    sent = 0,
    autoIndex = 0,
    needsDraw = true;
  let viewHeight = 900,
    viewTop = embedded ? 24 : 88,
    viewBottom = 870,
    viewClipLeft = 0,
    viewClipRight = 0;
  const normalNames = RemedyPresets.names;
  const samples = RemedyPresets.entries.map(entry => entry.body);
  const storageKey = 'hiss-sc-simulator-v1';
  let liveMode = false,
    livePhase = 'idle',
    liveRoomId = null;
  let lastInterlude = false,
    externalFleetSignal = false;
  let historySince = 0,
    lastFlow = '';
  let readingFocus = null;
  let renderedScene = '';
  let renderedMotion = false;
  // Four independent viewports reuse the existing live renderers and message
  // records. Only the render context and per-lane flow state are scoped here;
  // the audio/message connection, lifetime clock and receipts remain single.
  const editorFleetSurface = document.createElement('canvas');
  editorFleetSurface.width = 1920;
  editorFleetSurface.height = 1080;
  let activeZone = null,
    zoneViews = {},
    zoneScY = NaN,
    zoneRenderClock = 0,
    lastZoneGeometry = '';
  const zoneKinds = ['normal', 'gift', 'fleet', 'sc'];
  const scRotation = SCCarousel.create();
  let scView = { id: null, phase: -1, count: 0 },
    scSlot = null;
  function disposeSCSlot() {
    scSlot?.layer.dispose();
    scSlot = null;
  }
  function disposeZones() {
    disposeSCSlot();
    window.FleetVHS?.dispose(ctx);
    for (const z of Object.values(zoneViews)) window.FleetVHS?.dispose(z.ctx);
    zoneViews = {};
    zoneScY = NaN;
    zoneRenderClock = clock;
  }
  function exitTime(m) {
    return m.kind === 'sc'
      ? SCExit.age(m, clock)
      : Number.isFinite(m.noticeExitAt) && clock >= m.noticeExitAt
        ? clock - m.noticeExitAt
        : -1;
  }
  function scProgress(m) {
    if (m.scLayout) {
      const p = m.scLayout.parts.find((p) => p.id === 'progress'),
        anim = p && window.ThemeKeyframes?.part(p, clock - m.born, exitTime(m));
      return m.scLayout.progress
        ? {
            ...m.scLayout.progress,
            x: m.scLayout.progress.x + (anim?.dx || 0),
            y: m.scLayout.progress.y + (anim?.dy || 0),
            opacity: anim?.opacity ?? m.scLayout.progress.opacity,
          }
        : null;
    }
    return {
      x: 18,
      y: m.cardHeight - 27,
      width: (m.renderWidth ?? layout.width) - 167,
      height: 2.4,
      duration: m.duration,
    };
  }
  function scPaintVersion(m) {
    return [
      window.ThemePartMedia?.revision || 0,
      window.ThemeTypography?.revision || 0,
      m.page,
      m.scSignature,
      m.scLayout?.mediaEnd
        ? Math.floor(Math.min(m.scLayout.mediaEnd, Math.max(0, motionAge(m))) / 16)
        : 0,
      m.scLayout?.parts.some((p) => ThemeKeyframes.hasTracks(p, exitTime(m)))
        ? Math.floor(Math.max(0, clock - m.born) / 16)
        : 0,
      m.scLayout?.maxDelay
        ? Math.floor(Math.min(520 + m.scLayout.maxDelay, Math.max(0, motionAge(m))) / 25)
        : 0,
    ].join('|');
  }
  function drawSCSlot(m, top, q) {
    // One persistent material field carries every card. Changing a message must
    // not restart its fluids, replay its entry or restart the expiry countdown.
    if (
      scSlot &&
      (scSlot.height !== m.cardHeight ||
        scSlot.signature !== m.scSignature ||
        scSlot.options.width !== (m.renderWidth ?? layout.width))
    ) {
      scSlot.height = m.cardHeight;
      scSlot.signature = m.scSignature;
      Object.assign(scSlot.options, {
        height: m.cardHeight,
        width: m.renderWidth ?? layout.width,
        progress: scProgress(m),
        progressAt: () => scProgress(m),
        nameBand: m.scLayout?.nameBand || [53, 57 + m.nameHeight],
      });
      scSlot.layer.reconfigure(scSlot.options, clock - scSlot.born);
    }
    if (!scSlot) {
      const options = {
        transparent: true,
        continuousTime: true,
        width: m.renderWidth ?? layout.width,
        height: m.cardHeight,
        quality: q,
        fx: { ...m.fx },
        nameBand: m.scLayout?.nameBand || [53, 57 + m.nameHeight],
        seed: 2.31,
        progress: scProgress(m),
        progressAt: () => scProgress(scSlot.message),
        paintVersion: () =>
          [scSlot.message.id, scPaintVersion(scSlot.message), scView.index, scView.count].join('/'),
        paint: (c, r, remaining) => paintCard(scSlot.message, c, r, remaining),
      };
      const carried = m.layer;
      m.layer = null;
      m.layerLayout = null;
      scSlot = {
        message: m,
        height: m.cardHeight,
        signature: m.scSignature,
        options,
        born: m.born,
        last: clock,
        layer: carried || HissSimulation.createLayer(options),
      };
      if (carried) carried.reconfigure(options, clock - scSlot.born);
    }
    scSlot.message = m;
    if (!m.scLayout) scSlot.options.nameBand[1] = 57 + m.nameHeight;
    if (scSlot.options.progress) scSlot.options.progress.duration = m.duration;
    const blend = paused && editorDoc() ? 1 : 1 - Math.exp(-Math.max(0, clock - scSlot.last) / 150);
    for (const key of fxKeys)
      scSlot.options.fx[key] +=
        ((m.animatedFX || m.fx)[key] - scSlot.options.fx[key]) *
        (ThemeKeyframes.hasTracks(m.spec, exitTime(m)) ? 1 : blend);
    scSlot.last = clock;
    // Expiry uses its normal retreat when no other valid SC can take over.
    scSlot.layer.draw(
      ctx,
      0,
      top,
      clock - scSlot.born,
      SCExit.remaining(m, clock),
      q,
      scView.phase < 0 ? SCExit.age(m, clock) : -1,
      scView.phase,
      motionAge(m),
    );
    return scSlot.layer.kind;
  }
  function zoneView(kind) {
    if (zoneViews[kind]) return zoneViews[kind];
    const spec = LiveLayoutConfig.zone(kind, presentation),
      surface = document.createElement('canvas');
    return (zoneViews[kind] = {
      spec,
      canvas: surface,
      ctx: surface.getContext('2d', { alpha: true }),
      camera: 0,
      cameraTarget: 0,
      worldBase: 0,
      readingFocus: null,
      nextRelease: 0,
      noticeReadyAt: 0,
      lastSC: -2000,
    });
  }
  function inZone(kind, run) {
    const z = zoneView(kind),
      spec = z.spec,
      all = messages,
      pending = queue;
    const saved = {
      canvas,
      ctx,
      layout,
      viewTop,
      viewBottom,
      viewHeight,
      viewClipLeft,
      viewClipRight,
      camera,
      cameraTarget,
      worldBase,
      readingFocus,
      nextRelease,
      noticeReadyAt,
      lastSC,
      externalFleetSignal,
      lastInterlude,
    };
    activeZone = kind;
    canvas = z.canvas;
    ctx = z.ctx;
    layout = {
      width: spec.width,
      fontSize: spec.fontSize,
      lineHeight: spec.lineHeight,
      quality: 1.5,
    };
    messages = all.filter((m) => m.kind === kind);
    queue = pending.filter((m) => m.kind === kind);
    if (editorDoc()) layout.width = spec.w;
    const width = layout.width + 112,
      scale = editorDoc() ? 1 : (spec.w + spec.bleed) / width;
    viewHeight = spec.h / scale;
    viewTop = kind === 'normal' ? 20 : 0;
    viewBottom = viewHeight - (kind === 'normal' ? 12 : 0);
    viewClipLeft = viewClipRight = spec.bleed / 2 / scale;
    // Long labels remain whole: the two single-notice lanes can fit a taller
    // offscreen surface inside their fixed visible box without cropping text.
    if (kind === 'gift' || kind === 'fleet') {
      viewHeight = Math.max(viewHeight, ...messages.slice(-1).map((m) => m.height + 24));
      viewBottom = viewHeight;
    }
    const w = Math.round(width * layout.quality),
      h = Math.ceil(viewHeight * layout.quality);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    camera = z.camera;
    cameraTarget = z.cameraTarget;
    worldBase = z.worldBase;
    readingFocus = z.readingFocus;
    nextRelease = z.nextRelease;
    noticeReadyAt = z.noticeReadyAt;
    lastSC = z.lastSC;
    externalFleetSignal = false;
    lastInterlude = false;
    try {
      return run(z);
    } finally {
      Object.assign(z, {
        camera,
        cameraTarget,
        worldBase,
        readingFocus,
        nextRelease,
        noticeReadyAt,
        lastSC,
        viewHeight,
      });
      messages = all
        .filter((m) => m.kind !== kind)
        .concat(messages)
        .sort((a, b) => a.id - b.id);
      const remaining = new Set(queue);
      queue = pending.filter((m) => m.kind !== kind || remaining.has(m));
      ({
        canvas,
        ctx,
        layout,
        viewTop,
        viewBottom,
        viewHeight,
        viewClipLeft,
        viewClipRight,
        camera,
        cameraTarget,
        worldBase,
        readingFocus,
        nextRelease,
        noticeReadyAt,
        lastSC,
        externalFleetSignal,
        lastInterlude,
      } = saved);
      activeZone = null;
    }
  }
  function renderZones() {
    const normal = zoneView('normal'),
      n = normal.spec,
      scale = (n.w + n.bleed) / (n.width + 112);
    const tail = Math.min(
        n.h,
        Math.max(
          0,
          ...messages
            .filter((m) => m.kind === 'normal')
            .map((m) => (20 + m.drawY + m.height - normal.camera) * scale),
        ),
      ),
      target =
        presentation === 'custom'
          ? LiveLayoutConfig.zone('sc', presentation).y
          : Math.max(290, Math.min(510, n.y + tail + 8));
    if (!Number.isFinite(zoneScY)) zoneScY = target;
    else
      zoneScY += (target - zoneScY) * (1 - Math.exp(-Math.max(1, clock - zoneRenderClock) / 115));
    if (Math.abs(zoneScY - target) < 0.15) zoneScY = target;
    zoneRenderClock = clock;
    const editorRenderer = presentation === 'custom' && renderer()?.active ? renderer() : null;
    const output = ctx;
    output.setTransform(1, 0, 0, 1, 0, 0);
    output.clearRect(0, 0, 1920, 1080);
    for (const kind of zoneKinds) {
      if (kind === 'fleet' || LiveLayoutConfig.zone(kind, presentation).enabled === false) continue;
      const z = zoneView(kind),
        r = kind === 'sc' ? { ...z.spec, y: zoneScY } : z.spec;
      inZone(kind, () => {
        render();
        // Transparent feathering removes hard optical cuts at region boundaries.
        const W = layout.width + 112;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        for (const [start, end] of [
          [0, 9],
          [viewHeight, viewHeight - 12],
        ]) {
          const g = ctx.createLinearGradient(0, start, 0, end);
          g.addColorStop(0, '#000');
          g.addColorStop(1, '#0000');
          ctx.fillStyle = g;
          ctx.fillRect(0, Math.min(start, end), W, Math.abs(start - end));
        }
        ctx.restore();
      });
      const W = editorRenderer ? r.w + 112 : r.width + 112,
        scale = editorRenderer ? 1 : Math.min((r.w + r.bleed) / W, r.h / z.viewHeight),
        width = W * scale,
        height = z.viewHeight * scale;
      const x = editorRenderer
          ? r.x - 56
          : kind === 'gift'
            ? r.x - 83 * scale + 8
            : r.x + (r.w - width) / 2,
        y = r.y;
      const entry =
        presentationMotion.phase === 'idle'
          ? 1
          : LiveLayoutMotion.ease(
              (presentationMotion.progress - ({ normal: 0, gift: 0.06, sc: 0.12 }[kind] || 0)) /
                0.88,
            );
      const shift = 1 - entry;
      if (editorRenderer)
        editorRenderer.drawLayer(kind, z.canvas, {
          r,
          x: x + (kind === 'gift' ? -18 : 14) * shift,
          y: y + 8 * shift,
          width,
          height,
          entry,
        });
      else {
        output.save();
        output.beginPath();
        output.rect(r.x, r.y, r.w, r.h);
        output.clip();
        output.globalAlpha = entry;
        output.drawImage(
          z.canvas,
          x + (kind === 'gift' ? -18 : 14) * shift,
          y + 8 * shift,
          width,
          height,
        );
        output.restore();
      }
    }
    // Fleet notices share the full scene's coordinate system. Their material and
    // signal are never clipped by the guide rectangle or the old chat viewport.
    const fleetBase = LiveLayoutConfig.zone('fleet', presentation),
      fleet = fleetBase.enabled === false ? null : messages.findLast((m) => m.kind === 'fleet'),
      fleetSpec =
        editorRenderer && fleet
          ? parent.ThemeEditorModel.resolveComponent(fleetBase, fleet)
          : fleetBase;
    const fleetOut = editorRenderer ? editorFleetSurface.getContext('2d') : output;
    if (editorRenderer) fleetOut.clearRect(0, 0, 1920, 1080);
    canvas.dataset.fleetStage = JSON.stringify(
      FleetStage.draw(fleetOut, {
        message: fleet,
        clock,
        rect: presentation === 'custom' ? fleetSpec : null,
      }),
    );
    if (editorRenderer) editorRenderer.drawLayer('fleet', editorFleetSurface, { full: true });
    const geometry = JSON.stringify({ scY: Math.round(zoneScY) });
    canvas.dataset.zoneGeometry = geometry;
    if (geometry !== lastZoneGeometry) {
      lastZoneGeometry = geometry;
      parent.postMessage(
        { channel: 'hiss-main-reply', type: 'zone-layout', scY: zoneScY },
        location.origin,
      );
    }
    canvas.dataset.zones = JSON.stringify(
      Object.fromEntries(
        zoneKinds.map((kind) => [
          kind,
          {
            visible: messages.filter((m) => m.kind === kind).length,
            queued: queue.filter((m) => m.kind === kind).length,
          },
        ]),
      ),
    );
    canvas.dataset.scActive = String(messages.filter((m) => m.kind === 'sc').length);
    canvas.dataset.scExiting = String(messages.filter((m) => m.exitAt !== undefined).length);
    const selected = messages.find((m) => m.id === scView.id);
    canvas.dataset.scCarousel = JSON.stringify({
      ...scView,
      renderer: scSlot?.layer.kind ?? null,
      sender: selected?.sender ?? null,
      remaining: selected ? +SCExit.remaining(selected, clock).toFixed(2) : 0,
      pool: messages
        .filter((m) => m.kind === 'sc')
        .map((m) => ({
          id: m.id,
          sender: m.sender,
          remaining: +SCExit.remaining(m, clock).toFixed(2),
          exiting: m.exitAt !== undefined,
        })),
    });
    canvas.setAttribute(
      'aria-label',
      '分区弹幕。' + messages.map((m) => m.kind + ' / ' + m.sender + '：' + m.body).join('。'),
    );
  }
  function releaseZones(now) {
    const before = queue.length;
    for (const kind of zoneKinds)
      inZone(kind, () => {
        // Admit SCs immediately. The carousel handles reading time, never the queue.
        if (kind === 'sc') {
          while (queue.length) release();
          return;
        }
        if (!queue.length || clock < nextRelease || !noticeAssetsReady(kind, now)) return;
        const current = messages.at(-1);
        if (['fleet', 'gift'].includes(kind) && current && !canMergeGift(queue[0], current)) {
          if (current.noticeExitAt === Infinity)
            current.noticeExitAt = Math.max(clock, noticeReadyAt);
          return;
        }
        const allowance = releaseAllowance();
        if (!allowance || clock < noticeReadyAt) return;
        if (kind === 'normal') {
          for (let i = 0; i < allowance && queue.length; i++) release();
        } else release();
      });
    if (queue.length !== before) updateStatus();
  }

  const sourceLabel = () => (liveMode ? '直播间 ' + (liveRoomId || '未连接') : '本地模拟');
  function readLab() {
    if (embedded) return {};
    try {
      return JSON.parse(localStorage.getItem('hiss-sc-preview-v1') || '{}') || {};
    } catch {
      return {};
    }
  }
  function importLab(initial = false) {
    const found = readLab();
    if (!initial && !Object.keys(found).length) {
      status('未找到可读取的设置，当前参数已保留。');
      return;
    }
    imported = found;
    const tier = Math.round(clamp(imported.tier, 0, 6, 3));
    $('tier').value = tier;
    selectedFx = preset(tier);
    for (const key of fxKeys)
      if (Number.isFinite(imported[key]))
        selectedFx[key] = clamp(
          imported[key],
          key === 'reach' ? 12 : 0,
          key === 'reach' ? 140 : 100,
        );
    layout = {
      width: Math.round(clamp(imported.width, 340, 600, 440)),
      fontSize: clamp(imported.fontSize, 16, 28, 21),
      lineHeight: clamp(imported.lineHeight, 135, 190, 158),
      quality: [1, 1.5, 2].includes(imported.quality) ? imported.quality : 1.5,
    };
    if (embedded) layout = { width: 516, fontSize: 28, lineHeight: 148, quality: 1.5 };
    $('sender').value =
      typeof imported.sender === 'string' ? TextLimit.take(imported.sender, 50) : '调查员 07';
    if (typeof imported.message === 'string') drafts.sc = TextLimit.take(imported.message, 1600);
    scDuration = Math.round(clamp(imported.duration, 1, 7200, 180));
    $('scDuration').value = scDuration;
    if (draftKind === 'sc') $('message').value = drafts.sc;
    $('fxSource').textContent = Object.keys(found).length
      ? '已读取特效预览的参数，发送时保存到这条 SC。'
      : '使用本档效果，发送时保存到这条 SC。';
    $('layoutInfo').textContent =
      layout.width +
      ' px 弹幕栏 · ' +
      layout.fontSize +
      ' px 正文 · ' +
      (layout.quality === 2 ? '精细' : layout.quality === 1 ? '轻量' : '标准') +
      '画面';
    for (const m of messages) {
      m.layer?.dispose();
      m.layer = null;
      measure(m);
    }
    resize();
    if (!initial) status('已读取设置；已有 SC 的效果参数保持原样。');
    updateComposer();
    if (!initial) saveDraft();
  }
  function present(value, transition = false, custom = null) {
    if (custom) LiveLayoutConfig.setCustom(custom);
    const next = LiveLayoutConfig.normalize(value);
    if (next === presentation) {
      if (next === 'custom') {
        resize();
        zoneScY = LiveLayoutConfig.zone('sc', next).y;
        for (const [kind, z] of Object.entries(zoneViews))
          z.spec = LiveLayoutConfig.zone(kind, next);
        for (const m of messages) measure(m);
        arrange(0, true);
        needsDraw = true;
      }
      return;
    }
    presentationMotion = { phase: transition ? 'move' : 'idle', progress: transition ? 0 : 1 };
    if (lastInterlude)
      parent.postMessage(
        { channel: 'hiss-main-reply', type: 'fleet-signal', age: null },
        location.origin,
      );
    lastInterlude = false;
    if (scSlot) {
      const owner = messages.find((m) => m.id === scSlot.message.id);
      if (owner) {
        owner.layer?.dispose();
        owner.layer = scSlot.layer;
        scSlot = null;
      }
    }
    disposeZones();
    presentation = next;
    document.documentElement.classList.toggle('floating', floating());
    layout = split()
      ? { width: 1808, fontSize: 28, lineHeight: 148, quality: 1 }
      : compact()
        ? { width: 280, fontSize: 27, lineHeight: 142, quality: 2 }
        : floating()
          ? { width: 456, fontSize: 27, lineHeight: 146, quality: 1.5 }
          : { width: 516, fontSize: 28, lineHeight: 148, quality: 1.5 };
    resize();
    for (const m of messages) {
      m.layerLayout = null;
      measure(m);
    }
    arrange(0, true);
    needsDraw = true;
    render();
  }
  function saveDraft() {
    if (embedded) return;
    try {
      drafts[draftKind] = $('message').value;
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          kind: draftKind,
          drafts,
          scDuration,
          sender: $('sender').value,
          tier: +$('tier').value,
          fx: selectedFx,
          fleetRank: $('fleetRank').value,
          giftName: $('giftName').value,
          giftQuantity: $('giftQuantity').value,
          giftValue: $('giftValue').value,
        }),
      );
    } catch {}
  }
  let segmenter;
  try {
    segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
  } catch {}
  const chars = (text) =>
    segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
  function font(c, size, weight = 400) {
    c.font = weight + ' ' + size + 'px ' + family;
  }
  function wrap(text, maxWidth, size, weight = 400, hang = true) {
    font(ctx, size, weight);
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const ch of chars(paragraph)) {
        if (line && ctx.measureText(line + ch).width > maxWidth) {
          if (
            hang &&
            /^[，。！？、；：）》」』】,.!?;:%]/.test(ch) &&
            ctx.measureText(line + ch).width < maxWidth + size * 0.5
          ) {
            lines.push(line + ch);
            line = '';
          } else {
            lines.push(line);
            line = ch;
          }
        } else line += ch;
      }
      if (line || paragraph === '') lines.push(line);
    }
    return lines;
  }
  function ellipsis(c, text, width, size, weight = 400) {
    font(c, size, weight);
    const cs = chars(text);
    while (cs.length && c.measureText(cs.join('')).width > width) {
      cs.pop();
      if (c.measureText(cs.join('') + '…').width <= width) return cs.join('') + '…';
    }
    return cs.join('');
  }
  function write(c, text, x, y, size, color, weight = 400) {
    font(c, size, weight);
    c.fillStyle = color;
    c.fillText(text, x, y);
  }
  function rule(c, x, y, x2, color = '#2a302c', weight = 1) {
    c.beginPath();
    c.strokeStyle = color;
    c.lineWidth = weight;
    c.moveTo(x, y);
    c.lineTo(x2, y);
    c.stroke();
  }
  function triangle(c, x, y, color, size = 5) {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + size * 2, y);
    c.lineTo(x + size, y + size * 1.7);
    c.closePath();
    c.lineWidth = 1.6;
    c.strokeStyle = color;
    c.stroke();
  }
  function timeLabel(n) {
    n = Math.max(0, Math.ceil(n));
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  }
  let measuringComponent = false;
  function measure(m) {
    m.entryMs = entryDuration(m);
    const parts = component(m.kind, m)?.parts || [];
    const owner = component(m.kind, m);
    m.motionEnd = Math.max(
      ThemeKeyframes.duration(owner),
      0,
      ...parts.filter((p) => p.visible).map((p) => ThemeKeyframes.duration(p)),
    );
    m.motionLoop =
      (owner?.motionLoop && ThemeKeyframes.hasTracks(owner)) ||
      parts.some((p) => p.visible && p.motionLoop && ThemeKeyframes.hasTracks(p));
    if (editorDoc() && !measuringComponent && (!split() || activeZone)) {
      const saved = layout,
        spec = component(m.kind, m);
      if (spec) {
        const containerWidth = combinedChat()
            ? (component('chat')?.w ?? layout.width)
            : layout.width,
          pad = combinedChat()
            ? Math.min(component('chat')?.paddingX ?? 27, Math.max(0, (containerWidth - 120) / 2))
            : 27,
          available = containerWidth - 2 * (pad - 27),
          width = Math.max(120, Math.min(available, spec.contentWidth || available));
        layout = { ...layout, width, fontSize: spec.fontSize, lineHeight: spec.linePercent };
        m.renderWidth = width;
        m.bodySize = spec.fontSize;
        m.contentLeft =
          pad -
          27 +
          (available - width) * (spec.align === 'center' ? 0.5 : spec.align === 'right' ? 1 : 0);
        m.spec = spec;
      }
      measuringComponent = true;
      try {
        return measure(m);
      } finally {
        layout = saved;
        measuringComponent = false;
      }
    }
    if (split() && !activeZone) return inZone(m.kind, () => measure(m));
    if (m.kind === 'fleet') {
      m.fleetDuration = entryDuration(m);
      m.fleetAmbient = true;
    }
    if (m.kind === 'gift') {
      m.giftLayout = editorDoc()
        ? GiftNotice.responsiveModel(layout.width - (embedded ? 54 : 0), m, m.spec)
        : null;
      m.giftHeight = GiftNotice.height(
        layout.width - (embedded ? 54 : 0),
        m,
        embedded,
        compact(),
        editorDoc() ? m.spec : null,
      );
      m.height = m.giftHeight + 26;
      return;
    }
    if (m.kind === 'fleet') {
      m.fleetLayout = FleetNotice.measureFeed({
        width: layout.width,
        fontSize: layout.fontSize,
        main: embedded,
        rank: m.rank,
        username: m.sender,
        ...(editorDoc()
          ? {
              iconSize: m.spec?.iconSize,
              titleSize: m.spec?.titleSize,
              nameSize: m.spec?.nameSize,
              nameWidth: m.spec?.nameWidth,
              parts: m.spec?.parts,
            }
          : {}),
      });
      m.fleetScale = m.fleetLayout.scale;
      m.height = m.fleetLayout.height;
      return;
    }
    if (m.kind === 'sc' && presentation === 'custom') {
      const z = m.spec || LiveLayoutConfig.zone('sc', presentation);
      if (z.fxCustom) {
        m.fx = {
          strength: z.scStrength,
          reach: z.scReach,
          textWarp: z.scWarp,
          red: z.scRed,
          dispersion: z.scDispersion,
          ghost: z.scGhost,
          speed: z.scSpeed,
        };
        m.editorFX = true;
      } else if (m.editorFX) {
        m.fx = preset(m.tier);
        m.editorFX = false;
      }
    }
    if (m.kind === 'sc' && m.spec?.parts?.length) {
      const halo = activeZone === 'sc' ? 48 : ChatViewport.halo(m.fx, HissSimulation.padding);
      m.scLayout = SCComponentParts.measure({
        width: layout.width - 54,
        data: { ...m, amount: m.amount ?? tiers[m.tier].amount },
        style: m.spec,
        viewportHeight: viewBottom - viewTop,
        halo,
      });
      m.reading = m.scLayout.reading;
      m.page = 0;
      m.lines = m.scLayout.parts.find((p) => p.id === 'body')?.lines || [];
      m.senderLines = m.scLayout.parts.find((p) => p.id === 'name')?.lines || [];
      m.nameHeight = m.scLayout.nameBand[1] - m.scLayout.nameBand[0];
      m.bodyY = m.scLayout.bodyY;
      m.lineH =
        (m.scLayout.parts.find((p) => p.id === 'body')?.lineH || layout.fontSize * 1.46) - 1;
      m.cardHeight = m.scLayout.height;
      m.scSignature = JSON.stringify(m.scLayout.parts);
      m.clearance =
        activeZone === 'sc' ? -16 : -10 - (m.fx.reach / 140) * 12 * Math.sqrt(m.fx.strength / 100);
      m.inset = 10 + m.clearance;
      m.height = m.cardHeight + 51 + m.clearance * 2;
      return;
    }
    const body = layout.fontSize,
      lineH = (body * layout.lineHeight) / 100,
      nameSize = Math.max(15, body * 0.76);
    m.lineH = lineH;
    m.nameSize = nameSize;
    if (m.kind === 'normal') {
      m.normal = NormalNotice.measure({
        sender: m.sender,
        body: m.body,
        main: embedded,
        ...layout,
        parts: m.spec?.parts,
        ...(presentation === 'custom'
          ? (({ bodyWeight, nameColor, bodyColor }) => ({ bodyWeight, nameColor, bodyColor }))(
              LiveLayoutConfig.zone('normal', presentation),
            )
          : {}),
      });
      Object.assign(m, { lines: m.normal.lines, height: m.normal.height });
      return;
    }
    const innerW = layout.width - 90;
    m.paragraphs = String(m.body)
      .split('\n')
      .map((p) => wrap(p, innerW, body + 1, embedded ? 600 : 400));
    m.lines = m.paragraphs.flat();
    const amount = '¥ ' + (m.amount ?? tiers[m.tier].amount);
    font(ctx, m.tier >= 5 ? body + 2 : body + 4, 600);
    m.senderWidth = Math.max(
      80,
      Math.min(innerW - 105, innerW - ctx.measureText(amount).width - 18),
    );
    m.senderLines = wrap(m.sender, m.senderWidth, body + 1, embedded ? 600 : 500, false);
    m.nameHeight = Math.min(3, m.senderLines.length) * (body + 7);
    m.bodyY = 57 + m.nameHeight + 17;
    if (compact()) {
      m.senderWidth = layout.width - 90;
      m.senderLines = wrap(m.sender, m.senderWidth, body + 1, 600, false);
      m.nameHeight = Math.min(2, m.senderLines.length) * (body + 7);
      m.amountY = 57 + m.nameHeight + 4;
      m.bodyY = m.amountY + body + 21;
    }
    const halo = activeZone === 'sc' ? 48 : ChatViewport.halo(m.fx, HissSimulation.padding);
    m.reading = SCReading.build(m.lines, {
      bodyY: m.bodyY,
      lineHeight: lineH + 1,
      viewportHeight: viewBottom - viewTop,
      halo,
      enabled: embedded,
      paragraphs: m.paragraphs,
    });
    m.page = 0;
    // Stable slot geometry lets different senders/pages share the same flow field.
    m.cardHeight =
      activeZone === 'sc' && !editorDoc()
        ? Math.max(m.reading.height, viewBottom - viewTop - 2 * halo - 24)
        : m.reading.height;
    m.clearance =
      activeZone === 'sc' ? -16 : -10 - (m.fx.reach / 140) * 12 * Math.sqrt(m.fx.strength / 100);
    m.inset = 10 + m.clearance;
    m.height = m.cardHeight + 51 + m.clearance * 2;
  }
  function paintCard(m, c, r, remaining) {
    if (m.scLayout) {
      SCComponentParts.paint(
        c,
        r,
        m.scLayout,
        { ...m, count: scView.count, index: scView.index },
        remaining,
        motionAge(m),
        clock - m.born,
        exitTime(m),
      );
      return;
    }
    const body = m.bodySize ?? layout.fontSize,
      sx = r.x + 18,
      innerW = r.w - 36;
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillStyle = '#141614';
    c.fillRect(r.x, r.y, r.w, r.h);
    const panel = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    panel.addColorStop(0, '#ffffff02');
    panel.addColorStop(1, '#0000000a');
    c.fillStyle = panel;
    c.fillRect(r.x, r.y, r.w, r.h);
    triangle(c, sx, r.y + 25, '#ee4d41', embedded ? 8 : 5);
    write(
      c,
      '异常通讯 / SC' +
        (activeZone === 'sc' && scView.count > 1 ? ' ' + scView.index + '/' + scView.count : ''),
      sx + (embedded ? 32 : 24),
      r.y + 22,
      embedded ? 19 : 14,
      '#f05245',
      embedded ? 600 : 500,
    );
    if (m.reading.pages.length > 1) {
      const page =
          String(m.page + 1).padStart(2, '0') +
          ' / ' +
          String(m.reading.pages.length).padStart(2, '0'),
        size = compact() ? 12 : 15;
      font(c, size, 500);
      write(
        c,
        page,
        r.x + r.w - 18 - c.measureText(page).width,
        r.y + (compact() ? 41 : 25),
        size,
        '#a5a999',
        500,
      );
    }
    m.senderLines
      .slice(0, compact() ? 2 : 3)
      .forEach((s, i) =>
        write(
          c,
          i === (compact() ? 1 : 2) && m.senderLines.length > (compact() ? 2 : 3)
            ? ellipsis(c, s + '…', m.senderWidth, body + 1, embedded ? 600 : 500)
            : s,
          sx,
          r.y + 57 + i * (body + 7),
          body + 1,
          '#eff0e7',
          embedded ? 600 : 500,
        ),
      );
    const amount = '¥ ' + (m.amount ?? tiers[m.tier].amount),
      amountSize = m.tier >= 5 ? body + 2 : body + 4;
    font(c, amountSize, 600);
    write(
      c,
      amount,
      compact() ? sx : r.x + r.w - 18 - c.measureText(amount).width,
      r.y + (compact() ? m.amountY : 55),
      amountSize,
      '#f3f1e8',
      600,
    );
    m.reading.pages[m.page].forEach((s, i) =>
      write(c, s, sx, r.y + m.bodyY + i * (m.lineH + 1), body + 1, '#f0f0e6', embedded ? 600 : 400),
    );
    const py = r.y + r.h - 27,
      trackW = innerW - 77;
    rule(c, sx, py, sx + trackW, '#30372f', 2);
    write(c, timeLabel(remaining), sx + trackW + 17, py - 7, 13, '#ef5145', 500);
  }
  function updateComposer() {
    const sc = draftKind === 'sc',
      fleet = draftKind === 'fleet',
      gift = draftKind === 'gift';
    $('composerHint').textContent = fleet
      ? '在发送者输入框按 Enter，或点击按钮发送开通提示。'
      : gift
        ? 'Enter 或按钮发送礼物。价值为本次礼物的总电池数。'
        : 'Enter 发送，Shift + Enter 换行。发送仅发生在本地预览。';
    $('normalHint').hidden = sc || fleet || gift;
    $('scFields').hidden = !sc;
    $('fleetFields').hidden = !fleet;
    $('giftFields').hidden = !gift;
    $('messageField').hidden = fleet || gift;
    $('charCount').hidden = fleet || gift;
    $('message').maxLength = sc ? 1600 : 300;
    $('charCount').textContent = $('message').value.length + ' / ' + (sc ? 1600 : 300);
    $('send').textContent = gift
      ? '发送礼物'
      : fleet
        ? '发送开通提示'
        : sc
          ? '发送 SC'
          : '发送弹幕';
    $('send').disabled =
      (!sc && !fleet && !gift && !$('message').value.trim()) || queue.length >= 50;
    if (liveMode) {
      $('send').disabled = true;
      $('composerHint').textContent = '当前显示真实直播消息。切换为“本地模拟”后可手动测试。';
    }
    for (const id of ['auto', 'burst', 'seed', 'scExitPreview']) $(id).disabled = liveMode;
  }

  function status(text) {
    $('sendStatus').textContent = text;
    if (embedded)
      parent.postMessage(
        { channel: 'hiss-main-reply', type: 'status', text },
        location.origin === 'null' ? '*' : location.origin,
      );
  }
  function updateStatus() {
    if (following) historySince = sent;
    if (embedded) {
      const flow = JSON.stringify({
        following,
        unread: following ? 0 : Math.max(0, sent - historySince),
        paused,
        auto,
        live: liveMode,
        phase: livePhase,
        roomId: liveRoomId,
        displayed: Math.min(80, messages.length),
        queued: queue.length,
      });
      if (flow !== lastFlow) {
        lastFlow = flow;
        parent.postMessage(
          { channel: 'hiss-main-reply', type: 'flow', state: JSON.parse(flow) },
          location.origin === 'null' ? '*' : location.origin,
        );
      }
    }
    $('queueState').textContent = queue.length
      ? '等待发送 ' + queue.length + ' 条' + (paused ? ' · 模拟已暂停' : '')
      : '队列为空';
    $('messageCount').textContent =
      '已发送 ' + sent + ' · 保留 ' + Math.min(80, messages.length) + ' 条';
    $('streamState').textContent =
      sourceLabel() +
      ' · ' +
      (paused
        ? '画面已暂停'
        : !following
          ? '查看历史'
          : liveMode && livePhase !== 'connected'
            ? {
                connecting: '连接中',
                retrying: '重新连接中',
                error: '连接失败',
                offline: '服务已断开',
                idle: '等待连接',
              }[livePhase] || '等待连接'
            : '跟随最新');
    $('latest').hidden = following;
    $('pause').textContent = paused ? '继续画面' : '暂停画面';
    $('auto').textContent = auto ? '停止自动弹幕' : '开始自动弹幕';
    updateComposer();
    canvas.setAttribute(
      'aria-label',
      sourceLabel() +
        '，已显示 ' +
        sent +
        ' 条，队列 ' +
        queue.length +
        ' 条。' +
        messages
          .slice(-4)
          .map((m) => m.sender + '：' + (m.body || '空白 SC'))
          .join('。'),
    );
  }
  function addRecord(m) {
    const li = document.createElement('li'),
      strong = document.createElement('strong');
    strong.textContent =
      (m.kind === 'sc'
        ? 'SC ¥' + (m.amount ?? tiers[m.tier].amount) + ' · '
        : m.kind === 'fleet'
          ? '舰队 · '
          : m.kind === 'gift'
            ? '异化物 · '
            : '') + m.sender;
    li.append(strong, document.createTextNode('：' + (m.body || '（空白留言）')));
    $('history').prepend(li);
    while ($('history').children.length > 10) $('history').lastChild.remove();
  }
  function enqueue(item, manual = false) {
    demoGeneration++;
    if (editorDoc() && !renderer().accepts(item)) return true;
    if (queue.length >= (liveMode ? 200 : 50)) {
      if (manual) status('队列已满，请稍后再发送。');
      return false;
    }
    queue.push({ ...item, manual, fx: item.fx ? { ...item.fx } : undefined });
    if (manual) {
      status(paused ? '已加入队列，继续模拟后发送。' : '已加入本地消息流。');
      $('announcement').textContent =
        '已加入本地队列：' + item.sender + '，' + (item.body || '空白 SC');
    }
    updateStatus();
    return true;
  }
  function giftBody(m) {
    return (
      m.giftName +
      ' × ' +
      m.quantity +
      ' · ' +
      (m.coinType === 'silver' ? '免费礼物' : m.value + ' 电池')
    );
  }
  function sameGiftIdentity(a, b) {
    if (a.source !== b.source || a.coinType !== b.coinType) return false;
    if (a.source === 'bilibili')
      return (
        !!a.userId &&
        a.userId !== '0' &&
        a.userId === b.userId &&
        !!a.giftId &&
        a.giftId === b.giftId
      );
    return a.sender === b.sender && a.giftName === b.giftName;
  }
  function canMergeGift(data, previous) {
    if (
      data?.kind !== 'gift' ||
      previous?.kind !== 'gift' ||
      NoticeLifetime.progress(previous, clock) >= 0 ||
      !sameGiftIdentity(data, previous)
    )
      return false;
    const gap =
      data.source === 'bilibili' &&
      Number.isFinite(data.receivedAt) &&
      Number.isFinite(previous.receivedAt)
        ? data.receivedAt - (previous.lastReceivedAt ?? previous.receivedAt)
        : clock - (previous.updatedAt ?? previous.born ?? 0);
    return (
      gap >= 0 &&
      gap < 5000 &&
      previous.quantity + data.quantity <= 999999 &&
      previous.value + data.value <= 999999999
    );
  }
  function liveItem(item) {
    if (!item || !['normal', 'gift', 'sc', 'fleet'].includes(item.kind)) return null;
    const m = {
      ...item,
      sender: TextLimit.take(item.sender || '匿名观众', 80),
      body: TextLimit.take(item.body || '', 1600),
    };
    if (m.kind === 'sc') {
      if (!Number.isFinite(m.amount) || m.amount <= 0) return false;
      m.tier = 0;
      for (let i = 0; i < tiers.length; i++) if (m.amount >= tiers[i].amount) m.tier = i;
      m.fx = preset(m.tier);
      m.duration = clamp(m.duration, 1, 86400, 60);
    } else if (m.kind === 'gift') {
      if (
        !Number.isSafeInteger(m.quantity) ||
        m.quantity < 1 ||
        !Number.isFinite(m.value) ||
        m.value < 0
      )
        return false;
      m.giftName = TextLimit.take(m.giftName || '未知礼物', 100);
      m.body = giftBody(m);
    } else if (m.kind === 'fleet' && !FleetNotice.names[m.rank]) return false;
    return m;
  }
  function acceptLive(item) {
    if (!liveMode) return false;
    const m = liveItem(item);
    return !!m && enqueue(m);
  }
  function restoreLive(items) {
    if (!liveMode || !Array.isArray(items)) return;
    for (const item of items.slice(-80)) {
      const m = liveItem(item);
      if (m) release(true, { ...m, restored: true });
    }
    arrange(0, true);
    needsDraw = true;
    updateStatus();
    if (messages.length)
      status('已恢复 ' + messages.length + ' 条近期消息，SC 延续原来的截止时间。');
  }
  function removeLiveSC(ids) {
    const removed = new Set(ids);
    queue = queue.filter((m) => m.kind !== 'sc' || !removed.has(m.scId));
    messages = messages.filter((m) => {
      if (m.kind === 'sc' && removed.has(m.scId)) {
        m.layer?.dispose();
        return false;
      }
      return true;
    });
    needsDraw = true;
    updateStatus();
    // Moderated content is also removed from the accessible recent-record list.
    $('history').replaceChildren();
    for (const m of messages.slice(-10)) addRecord(m);
  }
  function nativeDuration(m) {
    const parts = (component(m.kind, m)?.parts || []).filter((p) => p.visible),
      base =
        m.kind === 'normal'
          ? 220
          : m.kind === 'gift'
            ? 800
            : m.kind === 'fleet'
              ? FleetNotice.duration(m.rank)
              : 1000,
      maxDelay = Math.max(0, ...parts.map((p) => p.delay || 0));
    const media = Math.max(
      0,
      ...parts
        .filter((p) => p.kind === 'image')
        .map(
          (p) =>
            (p.delay || 0) + (m.kind === 'sc' ? 520 : 0) + (p.imageMode === 'evidence' ? 595 : 220),
        ),
    );
    return Math.max(base + maxDelay, media);
  }
  function entryDuration(m) {
    return ThemeAnimation.duration(component(m.kind, m), nativeDuration(m));
  }
  function motionAge(m) {
    return ThemeAnimation.age(clock - m.born, component(m.kind, m), nativeDuration(m));
  }
  function frameNotice(m) {
    if (embedded && m.kind !== 'normal')
      parent.postMessage(
        { channel: 'hiss-main-reply', type: 'notice', kind: m.kind, tier: m.tier },
        location.origin === 'null' ? '*' : location.origin,
      );
  }
  function release(seed = false, item = null) {
    if (item && editorDoc() && !renderer().accepts(item)) return;
    const data = item || queue.shift();
    if (!data) return;
    const previousGift = messages.at(-1);
    if (!seed && canMergeGift(data, previousGift)) {
      previousGift.previous = { quantity: previousGift.quantity, value: previousGift.value };
      previousGift.quantity += data.quantity;
      previousGift.value = Math.round((previousGift.value + data.value) * 100) / 100;
      previousGift.updatedAt = clock;
      previousGift.lastReceivedAt = data.receivedAt;
      previousGift.body = giftBody(previousGift);
      NoticeLifetime.start(previousGift, clock, 340, noticeSettings);
      readingFocus = {
        message: previousGift,
        ...NoticePacing.giftUpdateWindow(
          readingFocus?.message === previousGift ? readingFocus : null,
          clock,
        ),
      };
      sent++;
      nextRelease = clock + 130;
      noticeReadyAt = clock + 360;
      addRecord(previousGift);
      frameNotice(previousGift);
      if (data.manual) status('同名礼物已累加，数量和价值正在更新。');
      updateStatus();
      return;
    }
    if (data.kind === 'sc' && data.expiresAt && data.expiresAt <= Date.now()) return;
    const restoredAge =
      data.restored && Number.isFinite(data.receivedAt)
        ? Math.max(0, Date.now() - data.receivedAt)
        : 0;
    if (split() && ['gift', 'fleet'].includes(data.kind)) {
      for (const previous of messages.filter((m) => m.kind === data.kind))
        previous.layer?.dispose();
      messages = messages.filter((m) => m.kind !== data.kind);
      worldBase = 0;
      camera = cameraTarget = 0;
    }
    const m = {
      ...data,
      id: ++id,
      born: seed ? clock - Math.max(3000, entryDuration(data), restoredAge) : clock,
      timerStarted: clock - restoredAge,
      layer: null,
    };
    NoticeLifetime.start(m, clock, seed ? 0 : entryDuration(m), noticeSettings);
    measure(m);
    messages.push(m);
    sent++;
    if (!seed) frameNotice(m);
    if (!seed && m.kind !== 'normal') {
      const text = m.kind === 'sc' ? m.reading.pages[0].join('') : m.body;
      const timing = NoticePacing.windowFor(
        m.kind,
        text,
        m.kind === 'sc' ? SCExit.remaining(m, clock) : Infinity,
        SCExit.duration,
        m.kind === 'fleet' ? entryDuration(m) : 0,
      );
      readingFocus = { message: m, until: clock + timing.hold, contextAt: clock + timing.context };
    }
    if (embedded && messages.length === 1) arrange(0, true);
    if (!seed && m.kind !== 'normal') {
      lastSC = clock;
      noticeReadyAt = clock + (entryDuration(m) + (m.kind === 'fleet' ? 150 : 80));
    }
    nextRelease = clock + 130;
    addRecord(m);
    if (data.manual)
      status(
        '已发送' +
          (data.kind === 'sc'
            ? ' SC。'
            : data.kind === 'fleet'
              ? '开通提示。'
              : data.kind === 'gift'
                ? '礼物档案。'
                : '弹幕。'),
      );
    updateStatus();
  }
  function sendManual() {
    if (liveMode) {
      status('请先切换到本地模拟。');
      return;
    }
    if (draftKind === 'gift') {
      const quantity = Number($('giftQuantity').value),
        value = Number($('giftValue').value);
      if (
        !$('giftQuantity').value.trim() ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 999999 ||
        !$('giftValue').value.trim() ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 999999999
      ) {
        status('数量需为 1–999999 的整数，价值需为 0–999999999 的整数。');
        return;
      }
      const item = {
        kind: 'gift',
        sender: TextLimit.take($('sender').value.trim(), 50) || '观众',
        giftName: TextLimit.take($('giftName').value.trim(), 60) || '礼物名称',
        quantity,
        value,
      };
      item.body = giftBody(item);
      if (enqueue(item, true)) saveDraft();
      return;
    }
    if (draftKind === 'fleet') {
      const rank = $('fleetRank').value,
        item = {
          kind: 'fleet',
          sender: TextLimit.take($('sender').value.trim(), 50) || '观众',
          rank,
          body: '开通' + FleetNotice.names[rank],
        };
      if (enqueue(item, true)) saveDraft();
      return;
    }
    const body = TextLimit.take($('message').value, draftKind === 'sc' ? 1600 : 300);
    if (draftKind === 'normal' && !body.trim()) {
      status('先写一条弹幕。');
      return;
    }
    const item = {
      kind: draftKind,
      sender: TextLimit.take($('sender').value.trim(), 50) || '观众',
      body,
      tier: +$('tier').value,
      fx: { ...selectedFx },
      duration: scDuration,
    };
    if (enqueue(item, true)) {
      if (draftKind === 'normal') {
        $('message').value = '';
        drafts.normal = '';
      }
      saveDraft();
      updateComposer();
    }
  }
  function example(i) {
    return {
      kind: 'normal',
      sender: normalNames[i % normalNames.length],
      body: samples[i % samples.length],
    };
  }
  function clearMessages() {
    demoGeneration++;
    if (embedded) renderer()?.clear();
    scRotation.reset();
    scView = { id: null, phase: -1, count: 0 };
    disposeZones();
    if (embedded && lastInterlude)
      parent.postMessage(
        { channel: 'hiss-main-reply', type: 'fleet-signal', age: null },
        location.origin,
      );
    lastInterlude = false;
    for (const m of messages) m.layer?.dispose();
    messages = [];
    queue = [];
    readingFocus = null;
    worldBase = 0;
    camera = 0;
    cameraTarget = 0;
    following = true;
    clock = 0;
    lastSC = -2000;
    noticeReadyAt = 0;
    nextRelease = 0;
    nextAuto = 1000;
    autoIndex = 0;
    sent = 0;
    needsDraw = true;
    $('history').replaceChildren();
    updateStatus();
  }
  function seed() {
    clearMessages();
    const parse = (text) =>
      String(text || '')
        .split('\n')
        .filter((s) => s.trim())
        .slice(0, 6)
        .map((line) => {
          const i = line.indexOf('|');
          return {
            kind: 'normal',
            sender: i < 0 ? '观众' : line.slice(0, i).trim(),
            body: i < 0 ? line : line.slice(i + 1).trim(),
          };
        });
    const before = parse(
        typeof imported.before === 'string'
          ? imported.before
          : '小北 | 欢迎来到太古屋\n白噪声 | 先去控制点，再继续探索太古屋。',
      ),
      after = parse(
        typeof imported.after === 'string'
          ? imported.after
          : '调查员 12 | 收到。\n小北 | 前面有希斯，小心。\n白噪声 | 晚上好。',
      );
    for (const m of before) release(true, m);
    if (draftKind === 'normal' && requestedMode === 'normal') {
      release(false, {
        kind: 'normal',
        sender: $('sender').value.trim() || '小北',
        body: drafts.normal.trim() || '欢迎来到太古屋\n先看看前面的门。',
      });
      arrange(0, true);
      status('普通弹幕示例已恢复，可以继续发送。');
      return;
    }
    if (draftKind === 'gift') {
      const g = {
        kind: 'gift',
        giftName: TextLimit.take($('giftName').value.trim(), 60) || '礼物名称',
        sender: $('sender').value || '调查员 07',
        quantity: Math.round(clamp($('giftQuantity').value, 1, 999999, 10)),
        value: Math.round(clamp($('giftValue').value, 0, 999999999, 1000)),
      };
      g.body = giftBody(g);
      release(false, g);
    } else if (draftKind === 'fleet')
      release(false, {
        kind: 'fleet',
        rank: $('fleetRank').value,
        sender: $('sender').value || '观众',
        body: '开通' + FleetNotice.names[$('fleetRank').value],
      });
    else
      release(true, {
        kind: 'sc',
        sender: $('sender').value || '调查员 07',
        body: drafts.sc,
        tier: +$('tier').value,
        fx: { ...selectedFx },
        duration: scDuration,
      });
    for (const m of after) release(true, m);
    nextRelease = 0;
    arrange(0, true);
    status('示例已恢复，可以继续发送消息。');
  }
  function arrange(dt, snap = false) {
    if (split() && !activeZone) {
      for (const kind of zoneKinds) inZone(kind, () => arrange(dt, snap));
      return { minCamera: 0, maxCamera: 0 };
    }
    if (activeZone && activeZone !== 'normal') {
      if (activeZone === 'sc') scView = scRotation.update(messages, clock);
      const visible =
        activeZone === 'sc' ? messages.filter((m) => m.id === scView.id) : messages.slice(-1);
      if (activeZone === 'sc' && !visible.length) disposeSCSlot();
      for (const m of messages)
        if (!visible.includes(m)) {
          m.drawY = -100000;
          m.worldY = -100000;
        }
      let y = 0;
      for (const m of visible) {
        if (m.kind === 'sc') m.page = scView.page % m.reading.pages.length;
        m.flowHeight = m.height;
        m.worldY = m.drawY = y;
        y += m.flowHeight + (combinedChat() ? component('chat')?.messageGap || 0 : 0);
      }
      camera = cameraTarget = activeZone === 'sc' ? -Math.max(0, (viewHeight - y) / 2) : 0;
      return { minCamera: camera, maxCamera: camera };
    }

    const shown = messages.filter((m) => componentVisible(m.kind)),
      anchor = following ? null : ChatViewport.captureAnchor(shown, camera);
    let y = worldBase;
    for (const m of messages) {
      if (!componentVisible(m.kind)) {
        m.flowHeight = 0;
        m.worldY = m.drawY = y;
        continue;
      }
      if (m.kind === 'sc')
        m.page = SCReading.indexAt(m.reading, (m.exitAt ?? clock) - m.timerStarted);
      const exitAge = SCExit.age(m, clock);
      m.flowHeight =
        m.height * (m.kind === 'sc' ? SCExit.occupied(exitAge) : NoticeLifetime.occupied(m, clock));
      m.worldY = y;
      m.drawY = y - (m.height - m.flowHeight) * 0.5;
      y += m.flowHeight + (combinedChat() ? component('chat')?.messageGap || 0 : 0);
    }
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i],
        age = motionAge(m);
      if (!componentVisible(m.kind) || m.kind !== 'sc' || m.exitAt !== undefined || age >= 1000)
        continue;
      const compression =
        Math.max(0, m.height - 52) * (1 - HissSimulation.occupied(age, m.cardHeight, m.fx)) * 0.5;
      for (let j = 0; j < messages.length; j++)
        if (j !== i) messages[j].drawY += j < i ? compression : -compression;
    }
    const bottom = messages.length
      ? Math.max(
          ...messages.map((m) =>
            (m.kind === 'sc' && m.exitAt !== undefined) || NoticeLifetime.progress(m, clock) >= 0
              ? m.worldY + m.flowHeight
              : m.drawY + m.height,
          ),
        )
      : worldBase;
    // Keep the current reading position when unseen messages change the flow.
    const historyShift = ChatViewport.anchorDelta(anchor);
    camera += historyShift;
    cameraTarget += historyShift;
    const { minCamera, maxCamera } = embedded
      ? ChatViewport.bounds(shown, worldBase, viewBottom - viewTop, HissSimulation.padding)
      : { minCamera: worldBase, maxCamera: Math.max(worldBase, bottom - (viewBottom - viewTop)) };
    if (following) cameraTarget = maxCamera;
    else cameraTarget = Math.max(minCamera, Math.min(maxCamera, cameraTarget));
    const recentNormal = messages.at(-1)?.kind === 'normal' && clock - messages.at(-1).born < 400,
      activeSC = messages.some(
        (m) => m.kind === 'sc' && (clock - m.born < 1000 || m.exitAt !== undefined),
      );
    const scrollLag = recentNormal && !activeSC ? 60 : 115;
    camera = snap
      ? cameraTarget
      : camera + (cameraTarget - camera) * (1 - Math.exp(-dt / scrollLag));
    if (Math.abs(camera - cameraTarget) < 0.05) camera = cameraTarget;
    while (messages.length > 80) {
      const first = messages.shift();
      first.layer?.dispose();
      worldBase = first.worldY + first.flowHeight;
    }
    return { minCamera, maxCamera };
  }
  function render() {
    const chatInk = chatSurface();
    document.documentElement.classList.toggle('theme-chat-surface', !!chatInk);
    for (const m of messages) {
      m.animatedSpec = ThemeKeyframes.component(m.spec, clock - m.born, exitTime(m));
      if (m.kind === 'sc')
        m.animatedFX = ThemeKeyframes.scFX(m.spec, clock - m.born, m.fx, exitTime(m));
    }
    if (editorDoc())
      canvas.dataset.editorMessages = JSON.stringify(
        messages.map((m) => ({
          id: m.id,
          kind: m.kind,
          fx: m.kind === 'sc' ? m.animatedFX : undefined,
          effects:
            m.kind === 'fleet'
              ? Object.fromEntries(
                  ThemeKeyframes.componentProperties('fleet').map((k) => [k, m.animatedSpec?.[k]]),
                )
              : undefined,
          rank: m.rank,
          tier: m.tier,
          styleKey: m.previewStyleKey,
          width: m.renderWidth,
          font: m.bodySize,
          lines: m.lines?.length,
          height: m.height,
          flowHeight: m.flowHeight,
          x: m.contentLeft || 0,
          y: viewTop + m.drawY - camera + (m.kind === 'gift' ? 5 : m.kind === 'sc' ? m.inset : 0),
          visible: componentVisible(m.kind),
          age: Math.round(clock - m.born),
          exitAge: exitTime(m),
          motionAge: Math.round(motionAge(m)),
          entryMs: entryDuration(m),
          motionEnd: m.motionEnd || 0,
          exitAt:
            m.kind === 'sc'
              ? (m.timerStarted ?? m.born) - m.born + m.duration * 1000
              : Number.isFinite(m.noticeExitAt)
                ? m.noticeExitAt - m.born
                : -1,
          exitMs: m.kind === 'sc' ? SCExit.duration : m.noticeExitMs || 0,
          parts: (
            m.normal?.parts ||
            m.fleetLayout?.parts ||
            m.giftLayout?.parts ||
            m.scLayout?.parts
          )?.map((p) => {
            const a = ThemeKeyframes.part(p, clock - m.born, exitTime(m));
            return {
              id: p.id,
              name: p.name,
              kind: p.kind,
              layoutX: p.layoutX,
              layoutY: p.layoutY,
              x: p.x + a.dx,
              y: p.y + a.dy,
              w: p.w,
              h: p.h,
              size: p.size,
              weight: p.weight,
              color: p.color,
              lineH: p.lineH,
              lineLimit: p.lineLimit,
              lines: p.lines?.length,
              visible: p.visible,
              opacity: a.opacity,
            };
          }),
        })),
      );
    if (split() && !activeZone) return renderZones();
    const q = layout.quality,
      W = layout.width + 112;
    ctx.setTransform(q, 0, 0, q, 0, 0);
    if (transparentInk()) ctx.clearRect(0, 0, W, viewHeight);
    else {
      ctx.fillStyle = inkBackground();
      ctx.fillRect(0, 0, W, viewHeight);
    }
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, embedded ? 0 : viewTop - 3, W, embedded ? viewHeight : viewBottom - viewTop + 15);
    ctx.clip();
    for (const m of messages) {
      const yy = viewTop + m.drawY - camera;
      if (
        !componentVisible(m.kind) ||
        motionAge(m) < 0 ||
        m.kind !== 'normal' ||
        yy + m.height < viewTop - 20 ||
        yy > viewBottom + 25
      )
        continue;
      if (floating()) {
        const shade = ctx.createLinearGradient(73, 0, W - 65, 0);
        shade.addColorStop(0, split() ? '#080b0a24' : '#080b0a78');
        shade.addColorStop(1, '#080b0a00');
        ctx.fillStyle = shade;
        ctx.fillRect(73, yy - 7, layout.width - 34, m.height - 14);
        ctx.save();
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 3;
      }
      NormalNotice.draw(ctx, {
        x: 83 + (m.contentLeft || 0),
        y: yy,
        age: motionAge(m),
        motionTime: clock - m.born,
        model: m.normal,
      });
      if (floating()) ctx.restore();
    }
    let active = 0,
      fleetVisible = 0,
      giftVisible = 0,
      simplified = false;
    for (const m of messages) {
      if (!componentVisible(m.kind) || motionAge(m) < 0) continue;
      if (m.kind === 'gift') {
        const gy = viewTop + m.drawY - camera + 5;
        if (gy + m.giftHeight > viewTop && gy < viewBottom) {
          giftVisible++;
          GiftNotice.draw(ctx, {
            x: (embedded ? 83 : 56) + (m.contentLeft || 0),
            y: gy,
            width: (m.renderWidth ?? layout.width) - (embedded ? 54 : 0),
            age: motionAge(m),
            motionTime: clock - m.born,
            motionExit: exitTime(m),
            exitProgress: NoticeLifetime.progress(m, clock),
            data: m,
            main: embedded,
            compact: compact(),
            style: editorDoc() ? m.spec : null,
            updateAge: m.updatedAt === undefined ? -1 : clock - m.updatedAt,
            previous: m.previous,
          });
        }
        continue;
      }
      if (m.kind === 'fleet') {
        const yy = viewTop + m.drawY - camera,
          ss = m.fleetScale;
        if (yy + m.height + 90 > viewTop && yy - 120 < viewBottom) {
          fleetVisible++;
          FleetNotice.draw(ctx, {
            ...m.fleetLayout.label,
            effectGain: m.animatedSpec?.effectGain,
            particleAmount: m.animatedSpec?.particleAmount,
            particleSpread: m.animatedSpec?.particleSpread,
            x: 56 + (m.contentLeft || 0) + (m.renderWidth ?? layout.width) / 2 - 429.5 * ss,
            y: yy + m.fleetLayout.offsetY,
            scale: ss,
            rank: m.rank,
            username: m.sender,
            age: motionAge(m),
            motionTime: clock - m.born,
            motionExit: exitTime(m),
            exitProgress: NoticeLifetime.progress(m, clock),
            sideLabel: false,
          });
        }
        continue;
      }
      if (m.kind !== 'sc') continue;
      const cardY = viewTop + m.drawY - camera + m.inset,
        top = cardY - HissSimulation.padding;
      if (top + m.cardHeight + HissSimulation.padding * 2 < viewTop || top > viewBottom) {
        if (m.layer) {
          m.layer.dispose();
          m.layer = null;
        }
        continue;
      }
      if (activeZone === 'sc') {
        active++;
        simplified ||= drawSCSlot(m, top, q) === 'fallback';
        continue;
      }
      const layerLayout = [
        m.renderWidth ?? layout.width,
        m.cardHeight,
        q,
        transparentInk(),
        inkBackground(),
        m.scSignature,
      ].join('/');
      if (!m.layer || m.layerLayout !== layerLayout) {
        const options = {
          transparent: transparentInk(),
          background: inkBackground(),
          continuousTime: true,
          width: m.renderWidth ?? layout.width,
          height: m.cardHeight,
          quality: q,
          fx: m.fx,
          nameBand: m.scLayout?.nameBand || [53, 57 + m.nameHeight],
          seed: m.id * 2.31,
          progress: scProgress(m),
          progressAt: () => scProgress(m),
          paintVersion: () => scPaintVersion(m),
          paint: (c, r, remaining) => paintCard(m, c, r, remaining),
        };
        if (m.layer) m.layer.reconfigure(options, clock - m.born);
        else m.layer = HissSimulation.createLayer(options);
        m.layerLayout = layerLayout;
      }
      m.layer.updateFX(m.animatedFX || m.fx);
      m.layer.draw(
        ctx,
        m.contentLeft || 0,
        top,
        clock - m.born,
        SCExit.remaining(m, clock),
        q,
        SCExit.age(m, clock),
        -1,
        motionAge(m),
      );
      active++;
      simplified ||= m.layer.kind === 'fallback';
    }
    const fleetSignal = messages.findLast(
      (m) =>
        componentVisible(m.kind) &&
        m.kind === 'fleet' &&
        motionAge(m) >= 0 &&
        motionAge(m) < FleetNotice.duration(m.rank) &&
        viewTop + m.drawY - camera + m.height > viewTop &&
        viewTop + m.drawY - camera < viewBottom,
    );
    if (fleetSignal && !(embedded && externalFleetSignal)) {
      const spec = fleetSignal.animatedSpec,
        fy = viewTop + fleetSignal.drawY - camera;
      let region = {
        x: viewClipLeft,
        y: embedded ? 0 : viewTop,
        w: W - viewClipLeft - viewClipRight,
        h: embedded ? viewHeight : viewBottom - viewTop,
      };
      if (spec?.effectScope === 'component')
        region = { x: 56, y: fy, w: layout.width, h: fleetSignal.height };
      if (spec?.effectScope === 'custom')
        region = { x: 56 + spec.effectX, y: spec.effectY, w: spec.effectW, h: spec.effectH };
      const age = motionAge(fleetSignal),
        signal = FleetNotice.signal(age, fleetSignal.rank);
      signal.vhs *= spec?.vhsAmount ?? 1;
      signal.glitch *= spec?.effectGain ?? 1;
      signal.flash *= spec?.effectGain ?? 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(region.x, region.y, region.w, region.h);
      ctx.clip();
      FleetNotice.drawSignal(ctx, {
        x: region.x,
        y: region.y,
        width: region.w,
        height: region.h,
        quality: q,
        age,
        rank: fleetSignal.rank,
        signal,
        focusX: W * 0.5,
        focusY: fy + 55,
      });
      ctx.restore();
    }
    if (embedded && externalFleetSignal) {
      const age = fleetSignal ? motionAge(fleetSignal) : null,
        signal = fleetSignal ? FleetNotice.signal(age, fleetSignal.rank) : null;
      if (signal) {
        signal.vhs *= fleetSignal.animatedSpec?.vhsAmount ?? 1;
        signal.glitch *= fleetSignal.animatedSpec?.effectGain ?? 1;
        signal.flash *= fleetSignal.animatedSpec?.effectGain ?? 1;
      }
      const spec = fleetSignal?.animatedSpec,
        chat = editorDoc()?.layers.find((l) => l.type === 'chat'),
        region =
          combinedChat() && spec?.effectScope === 'custom'
            ? { x: spec.effectX, y: spec.effectY, w: spec.effectW, h: spec.effectH }
            : combinedChat() && spec?.effectScope === 'component'
              ? {
                  x: fleetSignal.contentLeft || 0,
                  y: (chat?.paddingTop || 0) + viewTop + fleetSignal.drawY - camera,
                  w: fleetSignal.renderWidth || layout.width,
                  h: fleetSignal.height,
                }
              : null;
      if (fleetSignal || lastInterlude)
        parent.postMessage(
          {
            channel: 'hiss-main-reply',
            type: 'fleet-signal',
            age,
            rank: fleetSignal?.rank,
            signal,
            region,
          },
          location.origin,
        );
      lastInterlude = !!fleetSignal;
    } else if (embedded && lastInterlude) {
      parent.postMessage(
        { channel: 'hiss-main-reply', type: 'fleet-signal', age: null },
        location.origin,
      );
      lastInterlude = false;
    }
    ctx.restore();
    if (embedded && !floating()) {
      ctx.save();
      if (transparentInk()) ctx.globalCompositeOperation = 'destination-out';
      const edgeColor = transparentInk() ? '#000000' : inkBackground();
      // Apply the viewport edge only after all refraction has sampled its context.
      for (const [start, end] of [
        [0, 24],
        [viewHeight, viewHeight - 24],
      ]) {
        const edge = ctx.createLinearGradient(0, start, 0, end);
        edge.addColorStop(0, edgeColor);
        edge.addColorStop(1, edgeColor + '00');
        ctx.fillStyle = edge;
        ctx.fillRect(0, Math.min(start, end), W, 24);
      }
      for (const [start, end] of [
        [viewClipLeft, viewClipLeft + 16],
        [W - viewClipRight, W - viewClipRight - 16],
      ]) {
        const edge = ctx.createLinearGradient(start, 0, end, 0);
        edge.addColorStop(0, edgeColor);
        edge.addColorStop(1, edgeColor + '00');
        ctx.fillStyle = edge;
        ctx.fillRect(Math.min(start, end), 0, 16, viewHeight);
      }
      ctx.restore();
    } else if (!embedded) {
      write(ctx, '通讯记录', 83, 24, 25, '#e0e3db', 650);
      write(
        ctx,
        liveMode ? 'BILIBILI / LIVE MESSAGES' : 'LOCAL / LIVE SIMULATION',
        83,
        57,
        8.5,
        '#738776',
        500,
      );
      rule(ctx, 83, 76, W - 83, '#353b35');
    }
    if (!messages.length && !floating())
      write(ctx, '等待第一条消息', 83, viewHeight * 0.55, 18, '#728475');
    const entering = messages.findLast((m) => clock - m.born < entryDuration(m)),
      exiting = messages.find((m) => m.exitAt !== undefined);
    setText(
      'motionState',
      exiting
        ? 'SC 消散 ' +
            Math.round(SCExit.age(exiting, clock)) +
            ' / ' +
            SCExit.duration +
            ' ms · 上下文延后合拢'
        : entering
          ? entering.kind === 'normal'
            ? '通讯写入 ' + Math.round(clock - entering.born) + ' / 220 ms'
            : entering.kind === 'gift'
              ? '档案显影 ' + Math.round(clock - entering.born) + ' / 800 ms'
              : entering.kind === 'fleet'
                ? '舰队入场 ' +
                  Math.round(clock - entering.born) +
                  ' / ' +
                  entryDuration(entering) +
                  ' ms'
                : 'SC 入场 ' + Math.round(clock - entering.born) + ' / 1000 ms · 文字延后让位'
          : '持续消息流 · 红纹与上下文交叠',
    );
    const exitingCount = String(messages.filter((m) => m.exitAt !== undefined).length),
      scCount = String(messages.filter((m) => m.kind === 'sc').length);
    if (canvas.dataset.scExiting !== exitingCount) canvas.dataset.scExiting = exitingCount;
    if (canvas.dataset.scActive !== scCount) canvas.dataset.scActive = scCount;
    setText(
      'rendererState',
      (simplified ? '简化效果' : '持续红纹') +
        ' · ' +
        active +
        ' 条 SC' +
        (fleetVisible ? ' · ' + fleetVisible + ' 条开通提示' : '') +
        (giftVisible ? ' · ' + giftVisible + ' 条礼物档案' : ''),
    );
    const label =
      sourceLabel() +
      '，已显示 ' +
      sent +
      ' 条，队列 ' +
      queue.length +
      ' 条。' +
      messages
        .slice(-4)
        .map(
          (m) =>
            m.sender +
            (m.reading?.pages.length > 1
              ? '（正文第 ' + (m.page + 1) + '/' + m.reading.pages.length + ' 段）'
              : '') +
            '：' +
            (m.body || '空白 SC'),
        )
        .join('。');
    if (canvas.getAttribute('aria-label') !== label) canvas.setAttribute('aria-label', label);
  }
  function resize() {
    if (combinedChat() && !activeZone) {
      const chat = component('chat');
      if (!chat) {
        needsDraw = true;
        return;
      }
      layout = { ...layout, width: chat.w, fontSize: 28, lineHeight: 148, quality: 1.5 };
      viewHeight = Math.max(40, chat.h - chat.paddingTop - chat.paddingBottom);
      viewTop = 20;
      viewBottom = viewHeight - 12;
      viewClipLeft = viewClipRight = 56;
      canvas.width = Math.round((chat.w + 112) * layout.quality);
      canvas.height = Math.round(viewHeight * layout.quality);
      $('canvasShell').style.width = chat.w + 112 + 'px';
      $('canvasShell').style.height = viewHeight + 'px';
      needsDraw = true;
      return;
    }
    if (split() && !activeZone) {
      canvas.width = 1920;
      canvas.height = 1080;
      $('canvasShell').style.width = $('stage').clientWidth + 'px';
      $('canvasShell').style.height = $('stage').clientHeight + 'px';
      needsDraw = true;
      return;
    }
    const W = layout.width + 112,
      q = layout.quality;
    if (embedded) {
      const el = $('stage'),
        frame = window.frameElement,
        viewport = frame?.parentElement,
        scale = W / Math.max(1, el.clientWidth);
      viewClipLeft = frame && viewport ? Math.max(0, -frame.offsetLeft) * scale : 0;
      viewClipRight =
        frame && viewport
          ? Math.max(0, frame.offsetWidth + frame.offsetLeft - viewport.clientWidth) * scale
          : 0;
      viewHeight = Math.max(320, (el.clientHeight / Math.max(1, el.clientWidth)) * W);
      viewBottom = viewHeight - 12;
      canvas.width = Math.round(W * q);
      canvas.height = Math.round(viewHeight * q);
      $('canvasShell').style.width = el.clientWidth + 'px';
      $('canvasShell').style.height = el.clientHeight + 'px';
      needsDraw = true;
      return;
    }
    canvas.width = Math.round(W * q);
    canvas.height = Math.round(viewHeight * q);
    const stage = $('stage'),
      zoom = Math.max(
        0.12,
        Math.min((stage.clientWidth - 32) / W, (stage.clientHeight - 28) / viewHeight, 1.5),
      );
    $('canvasShell').style.width = W * zoom + 'px';
    $('canvasShell').style.height = viewHeight * zoom + 'px';
    lastDraw = -100;
    needsDraw = true;
  }
  function releaseAllowance() {
    if (
      !readingFocus ||
      !following ||
      clock >= readingFocus.until ||
      !messages.includes(readingFocus.message)
    ) {
      readingFocus = null;
      return 6;
    }
    const next = queue[0],
      m = readingFocus.message;
    if (messages.at(-1) === m && canMergeGift(next, m)) return 6;
    if (next?.kind !== 'normal') return 0;
    const key = [layout.width, layout.fontSize, layout.lineHeight].join('/');
    if (next.pacingKey !== key) {
      const measured = { ...next };
      measure(measured);
      next.pacingKey = key;
      next.pacingHeight = measured.height;
    }
    let y = worldBase,
      top = worldBase;
    for (const message of messages) {
      if (message === m)
        top =
          y + (m.kind === 'sc' ? m.inset - ChatViewport.halo(m.fx, HissSimulation.padding) : -8);
      y +=
        message.height * (message.kind === 'sc' ? SCExit.occupied(SCExit.age(message, clock)) : 1);
    }
    return NoticePacing.allowance({
      now: clock,
      until: readingFocus.until,
      contextAt: readingFocus.contextAt,
      following,
      nextKind: next.kind,
      top,
      tail: y,
      nextHeight: next.pacingHeight,
      viewHeight: viewBottom - viewTop,
    });
  }
  function noticeAssetsReady(kind, now) {
    const assets = kind === 'fleet' ? FleetNotice : kind === 'gift' ? GiftNotice : null;
    return !assets || assets.ready || assets.failed || now >= noticeAssetDeadline;
  }
  function tick(now) {
    const dt = last ? Math.min(80, Math.max(0, now - last)) : 0;
    last = now;
    if (!paused) {
      clock += dt;
      const wall = Date.now(),
        finished = messages.filter(
          (m) => SCExit.advance(m, clock, wall) || NoticeLifetime.finished(m, clock),
        );
      if (finished.length) {
        const done = new Set(finished);
        for (const m of finished) m.layer?.dispose();
        messages = messages.filter((m) => !done.has(m));
        updateStatus();
        needsDraw = true;
      }
      const queuedCount = queue.length;
      queue = queue.filter((m) => m.kind !== 'sc' || !m.expiresAt || m.expiresAt > wall);
      if (queue.length !== queuedCount) updateStatus();
      if (auto && !liveMode && clock >= nextAuto && queue.length < 8) {
        autoIndex++;
        if (autoIndex % 11 === 0) {
          const rank = ['captain', 'admiral', 'governor'][Math.floor(autoIndex / 11) % 3];
          enqueue({
            kind: 'fleet',
            sender: normalNames[autoIndex % normalNames.length],
            rank,
            body: '开通' + FleetNotice.names[rank],
          });
        } else if (autoIndex % 5 === 0) {
          const g = {
            kind: 'gift',
            sender: normalNames[autoIndex % normalNames.length],
            giftName: ['幸运纸盒', '能量电池', '应援信号'][Math.floor(autoIndex / 5) % 3],
            quantity: 1 + (autoIndex % 10),
            value: 100 * (1 + (autoIndex % 10)),
          };
          g.body = giftBody(g);
          enqueue(g);
        } else if (autoIndex % 7 === 0) {
          const tier = [0, 1, 3, 4][Math.floor(autoIndex / 7) % 4];
          enqueue({
            kind: 'sc',
            sender: normalNames[autoIndex % normalNames.length],
            body: '这段红光很有感觉，继续探索！',
            tier,
            fx: preset(tier),
            duration: 180,
          });
        } else enqueue(example(autoIndex));
        nextAuto = clock + 900 + (autoIndex % 4) * 260;
      }
      if (split()) releaseZones(now);
      else if (queue.length && clock >= nextRelease) {
        const allowance = releaseAllowance();
        if (allowance && queue[0].kind === 'normal') {
          // Coalesce a same-arrival run into one scroll target while preserving order.
          for (let count = 0; count < allowance && queue[0]?.kind === 'normal'; count++) release();
          if (allowance === 1) nextRelease = clock + 220;
        } else if (allowance && clock >= noticeReadyAt && noticeAssetsReady(queue[0].kind, now))
          release();
      }
    }
    arrange(paused ? 0 : dt);
    canvas.dataset.noticeLifetimes = JSON.stringify(
      messages
        .filter((m) => ['fleet', 'gift'].includes(m.kind))
        .map((m) => ({
          id: m.id,
          kind: m.kind,
          rank: m.rank,
          sender: m.sender,
          age: Math.round(clock - m.born),
          exit: NoticeLifetime.progress(m, clock),
          exitAt: m.noticeExitAt,
          exitMs: m.noticeExitMs,
          clock: Math.round(clock),
        })),
    );
    if ((!paused || needsDraw) && frameGate.due(now)) {
      const scene =
        RenderActivity.signature(messages, camera) +
        (split()
          ? '|' +
            Object.values(zoneViews)
              .map((z) => z.camera)
              .join('/') +
            '/' +
            zoneScY
          : '');
      const moving = split()
        ? zoneKinds.some((kind) =>
            inZone(kind, () =>
              RenderActivity.moving(messages, {
                clock,
                camera,
                viewTop,
                viewBottom,
                padding: HissSimulation.padding,
              }),
            ),
          )
        : RenderActivity.moving(messages, {
            clock,
            camera,
            viewTop,
            viewBottom,
            padding: HissSimulation.padding,
          });
      if (needsDraw || scene !== renderedScene || moving || renderedMotion) {
        // Commit the final settled frame once, even if a low FPS cap skips its time.
        render();
        renderedScene = scene;
        renderedMotion = moving;
        lastDraw = now;
        needsDraw = false;
      }
    }
    requestAnimationFrame(tick);
  }
  $('kind').addEventListener('change', () => {
    drafts[draftKind] = $('message').value;
    draftKind = $('kind').value;
    $('message').value = drafts[draftKind];
    updateComposer();
    saveDraft();
  });
  $('tier').addEventListener('change', () => {
    selectedFx = preset(+$('tier').value);
    $('fxSource').textContent = '使用本档效果；已发送的 SC 保持原样。';
    saveDraft();
  });
  $('scDuration').addEventListener('input', () => {
    const n = Number($('scDuration').value);
    if (Number.isInteger(n) && n >= 1 && n <= 7200) {
      scDuration = n;
      saveDraft();
    }
  });
  $('scDuration').addEventListener('change', () => {
    $('scDuration').value = scDuration;
  });
  $('scExitPreview').addEventListener('click', () => {
    if (liveMode) return;
    if (queue.length > 46) {
      status('先等待队列中的消息播放。');
      return;
    }
    if (!messages.length) enqueue({ kind: 'normal', sender: '白噪声', body: '先去控制点，再继续探索太古屋。' });
    enqueue(
      {
        kind: 'sc',
        sender: $('sender').value.trim() || '调查员 07',
        body: draftKind === 'sc' ? $('message').value : drafts.sc,
        tier: +$('tier').value,
        fx: { ...selectedFx },
        duration: 3,
      },
      true,
    );
    enqueue({ kind: 'normal', sender: '调查员 12', body: '先去控制点，再继续探索太古屋。' });
    status('已加入 3 秒 SC：归零后自动消散，下面的弹幕随后补位。');
  });
  $('fleetRank').addEventListener('change', saveDraft);
  $('sender').addEventListener('keydown', (e) => {
    if ((draftKind === 'fleet' || draftKind === 'gift') && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      sendManual();
    }
  });
  for (const field of ['giftName', 'giftQuantity', 'giftValue']) {
    $(field).addEventListener('input', saveDraft);
    $(field).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        sendManual();
      }
    });
  }
  $('message').addEventListener('input', () => {
    updateComposer();
    saveDraft();
  });
  $('sender').addEventListener('input', saveDraft);
  $('message').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendManual();
    }
  });
  $('send').addEventListener('click', sendManual);
  $('pause').addEventListener('click', () => {
    paused = !paused;
    last = 0;
    needsDraw = true;
    updateStatus();
  });
  $('auto').addEventListener('click', () => {
    auto = !auto;
    nextAuto = clock + 200;
    updateStatus();
  });
  $('burst').addEventListener('click', () => {
    let accepted = 0;
    for (let i = 0; i < 5; i++) if (enqueue(example(++autoIndex))) accepted++;
    status(accepted ? accepted + ' 条示例已加入队列。' : '队列已满，请稍后再发送。');
  });
  $('clear').addEventListener('click', () => {
    auto = false;
    clearMessages();
    status('消息已清空，发送内容和特效设置已保留。');
  });
  $('seed').addEventListener('click', seed);
  $('import').addEventListener('click', () => importLab());
  function scrollFeed(delta) {
    following = false;
    const bounds = arrange(0),
      next = ChatViewport.scroll(cameraTarget, delta, bounds);
    cameraTarget = next.camera;
    camera = cameraTarget;
    following = next.following;
    needsDraw = true;
    updateStatus();
  }
  function followLatest() {
    following = true;
    arrange(0, true);
    needsDraw = true;
    updateStatus();
  }
  $('latest').addEventListener('click', followLatest);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (split()) inZone('normal', () => scrollFeed(e.deltaY));
      else scrollFeed(e.deltaY);
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    const movement = { PageUp: -600, PageDown: 600, ArrowUp: -80, ArrowDown: 80, Home: -1e9 };
    if (e.key in movement) {
      e.preventDefault();
      scrollFeed(movement[e.key]);
    } else if (e.key === 'End') {
      e.preventDefault();
      followLatest();
    }
  });
  function pure(on) {
    document.body.classList.toggle('pure', on);
    requestAnimationFrame(resize);
  }
  $('pure').addEventListener('click', () => pure(true));
  $('back').addEventListener('click', () => pure(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (embedded)
        parent.postMessage(
          { channel: 'hiss-main-reply', type: 'exit-preview' },
          location.origin === 'null' ? '*' : location.origin,
        );
      else pure(false);
    }
  });
  window.addEventListener('theme-font-ready', () => {
    for (const m of messages) measure(m);
    arrange(0, true);
    needsDraw = true;
  });
  window.addEventListener('theme-part-media-ready', () => {
    needsDraw = true;
  });
  document.addEventListener('visibilitychange', () => {
    last = 0;
  });
  window.addEventListener('pagehide', () => {
    disposeZones();
    window.FleetVHS?.dispose(ctx);
    saveDraft();
    for (const m of messages) {
      m.layer?.dispose();
      m.layer = null;
    }
  });
  new ResizeObserver(resize).observe($('stage'));
  let savedDraft = null;
  try {
    if (!embedded) savedDraft = JSON.parse(localStorage.getItem(storageKey) || 'null');
  } catch {}
  importLab(true);
  if (savedDraft && typeof savedDraft === 'object') {
    if (savedDraft.scDuration !== undefined) {
      scDuration = Math.round(clamp(savedDraft.scDuration, 1, 7200, 180));
      $('scDuration').value = scDuration;
    }
    if (savedDraft.drafts) {
      for (const k of ['normal', 'sc'])
        if (typeof savedDraft.drafts[k] === 'string')
          drafts[k] = TextLimit.take(savedDraft.drafts[k], k === 'sc' ? 1600 : 300);
    }
    draftKind = ['sc', 'fleet', 'gift'].includes(savedDraft.kind) ? savedDraft.kind : 'normal';
    if (typeof savedDraft.giftName === 'string')
      $('giftName').value = TextLimit.take(savedDraft.giftName, 60);
    if (savedDraft.giftQuantity !== undefined)
      $('giftQuantity').value = Math.round(clamp(savedDraft.giftQuantity, 1, 999999, 10));
    if (savedDraft.giftValue !== undefined)
      $('giftValue').value = Math.round(clamp(savedDraft.giftValue, 0, 999999999, 1000));
    if (FleetNotice.names[savedDraft.fleetRank]) $('fleetRank').value = savedDraft.fleetRank;
    $('kind').value = draftKind;
    if (typeof savedDraft.sender === 'string')
      $('sender').value = TextLimit.take(savedDraft.sender, 50);
    if (Number.isInteger(savedDraft.tier) && tiers[savedDraft.tier]) {
      $('tier').value = savedDraft.tier;
      selectedFx = preset(savedDraft.tier);
      for (const k of fxKeys)
        if (Number.isFinite(savedDraft.fx?.[k]))
          selectedFx[k] = clamp(
            savedDraft.fx[k],
            k === 'reach' ? 12 : 0,
            k === 'reach' ? 140 : 100,
          );
    }
  }
  const requestedMode = new URLSearchParams(location.search).get('mode');
  if (['normal', 'fleet', 'gift', 'sc'].includes(requestedMode)) {
    draftKind = requestedMode;
    $('kind').value = requestedMode;
  }
  $('message').value = drafts[draftKind];
  if (savedDraft) $('fxSource').textContent = '使用已保存的发送参数，发送时保留到这条 SC。';
  updateComposer();
  if (embedded) clearMessages();
  else seed();
  const initialFleet = messages.find((m) => m.kind === 'fleet');
  FleetNotice.loading.then((ok) => {
    if (!ok) status('舰队动态材质未载入，已保留图形提示。');
    else if (initialFleet && messages.includes(initialFleet)) initialFleet.born = clock;
    needsDraw = true;
  });
  const initialGift = messages.find((m) => m.kind === 'gift');
  GiftNotice.loading.then((ok) => {
    if (!ok) status('物证照片未载入，已保留档案与示意轮廓。');
    else if (initialGift && messages.includes(initialGift)) initialGift.born = clock;
    needsDraw = true;
  });
  requestAnimationFrame(tick);
  if (!embedded)
    BilibiliLive.mount({
      setSource(on) {
        liveMode = on;
        auto = false;
        paused = false;
        clearMessages();
        status(on ? '等待真实消息；模拟发送已停用。' : '已切换到本地模拟，可以手动发送。');
      },
      reset() {
        auto = false;
        paused = false;
        clearMessages();
      },
      receive: acceptLive,
      restore: restoreLive,
      remove: removeLiveSC,
      status(phase, roomId) {
        livePhase = phase;
        liveRoomId = roomId;
        needsDraw = true;
        updateStatus();
      },
    });
  if (embedded) {
    document.documentElement.classList.add('embedded');
    const instance = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    window.NativeMessageSnapshot = () => ({
      capturedAt: Date.now(),
      paused,
      liveMode,
      queued: queue.map((m) => ({ ...m })),
      messages: messages
        .slice(-80)
        .map((m) => ({
          kind: m.kind,
          sender: m.sender,
          body: m.body,
          rank: m.rank,
          tier: m.tier,
          giftName: m.giftName,
          quantity: m.quantity,
          value: m.value,
          duration: m.duration,
          fx: m.fx,
          liveId: m.liveId,
          liveEnd: m.liveEnd,
          receivedAt: m.receivedAt,
          expiresAt: m.expiresAt,
          previewStyleKey: m.previewStyleKey,
          _snapshotId: m.id,
          _snapshotAge: Math.max(0, clock - m.born),
          _snapshotTimer: clock - (m.timerStarted ?? m.born),
          _snapshotExit: Number.isFinite(m.noticeExitAt) ? m.noticeExitAt - m.born : null,
        })),
    });
    const announceReady = () => {
      parent.postMessage(
        { channel: 'hiss-main-reply', type: 'ready', instance },
        location.origin === 'null' ? '*' : location.origin,
      );
      lastFlow = '';
      updateStatus();
    };
    function mainDemo(animated = false, preserveSource = false) {
      if (!animated && !demoAssetsReady) {
        const generation = ++demoGeneration;
        status('正在准备示例图片与文字…');
        demoAssets.then(() => {
          if (generation === demoGeneration) mainDemo(false, preserveSource);
        });
        return;
      }
      if (!preserveSource) liveMode = false;
      paused = false;
      auto = false;
      clearMessages();
      const demo = [
        { kind: 'normal', sender: '小北', body: '欢迎来到太古屋' },
        { kind: 'normal', sender: '白噪声', body: '先去控制点，再继续探索太古屋。' },
        { kind: 'gift', sender: '太古屋来客', giftName: '能量电池', quantity: 10, value: 1000 },
        {
          kind: 'sc',
          sender: '调查员 07',
          body: '前面有希斯，小心。',
          tier: 3,
          fx: preset(3),
          duration: 180,
        },
        { kind: 'fleet', sender: '回声', rank: 'captain', body: '开通舰长' },
      ];
      for (const m of floating() && !split()
        ? demo.filter((item) => item.kind === 'normal' || item.kind === 'sc')
        : demo) {
        if (m.kind === 'gift') m.body = giftBody(m);
        if (animated) {
          if (m.kind === 'fleet') {
            m.rank = 'governor';
            m.body = '开通总督';
          }
          if (m.kind === 'sc') m.duration = 25;
          enqueue(m);
        } else release(true, m);
      }
      arrange(0, true);
      needsDraw = true;
      status('示例已恢复。');
    }
    let lastEditorPreview = null;
    function seekEditorPreview(kind, ms, phase) {
      const target = messages.findLast((m) => m.kind === kind);
      if (!target) return;
      auto = false;
      paused = true;
      let offset = clamp(ms, 0, 30000, 0);
      if (phase === 'exit' && ['fleet', 'gift', 'sc'].includes(kind)) {
        if (kind === 'sc')
          offset += (target.timerStarted ?? target.born) - target.born + target.duration * 1000;
        else {
          if (!Number.isFinite(target.noticeExitAt))
            target.noticeExitAt = target.born + entryDuration(target) + 600;
          offset += target.noticeExitAt - target.born;
        }
      }
      clock = target.born + offset;
      if (kind === 'sc') {
        const end = (target.timerStarted ?? target.born) + target.duration * 1000;
        if (clock < end) delete target.exitAt;
        else target.exitAt = end;
      }
      last = 0;
      arrange(0, true);
      needsDraw = true;
      render();
    }
    function editorMessage(data) {
      const kind = ['normal', 'sc', 'gift', 'fleet'].includes(data?.kind) ? data.kind : 'normal',
        m = {
          kind,
          previewStyleKey: typeof data?.styleKey === 'string' ? data.styleKey : undefined,
          sender: TextLimit.take(data?.sender || '调查员 07', 50),
          body: TextLimit.take(data?.body || '欢迎来到太古屋', 1600),
          rank: FleetNotice.names[data?.rank] ? data.rank : 'captain',
          tier: Math.round(clamp(data?.tier, 0, 6, 3)),
          duration: 180,
          giftName: TextLimit.take(data?.body || '能量电池', 60),
          quantity: 10,
          value: 1000,
        };
      m.fx = preset(m.tier);
      if (kind === 'fleet') m.body = '开通' + FleetNotice.names[m.rank];
      if (kind === 'gift') m.body = giftBody(m);
      return m;
    }
    function createEditorPreview(data, seekAt, phase) {
      auto = false;
      paused = false;
      clearMessages();
      const m = editorMessage(data),
        kind = m.kind;
      release(true, { kind: 'normal', sender: '白噪声', body: '先去控制点，再继续探索太古屋。' });
      release(false, m);
      if (data?.exitPreview && ['fleet', 'gift', 'sc'].includes(kind)) {
        const target = messages.findLast((m) => m.kind === kind);
        if (!target) return;
        if (kind === 'sc') {
          target.duration = (entryDuration(target) + 600) / 1000;
          target.timerStarted = target.born;
          measure(target);
        } else target.noticeExitAt = target.born + entryDuration(target) + 600;
        clock = target.born + Math.max(0, entryDuration(target) - 150);
      }
      arrange(0, true);
      needsDraw = true;
      if (Number.isFinite(seekAt)) seekEditorPreview(kind, seekAt, phase);
    }
    window.addEventListener('message', (event) => {
      if (
        event.source !== parent ||
        event.origin !== location.origin ||
        event.data?.channel !== 'hiss-main'
      )
        return;
      const { command, data } = event.data;
      // Authoring previews are local to this editor canvas, even when the
      // published theme uses a live source. Do not change the live connection.
      const authoring = editorDoc() && new URLSearchParams(parent.location.search).has('editor');
      if (command === 'editor-demo' && authoring) {
        mainDemo(true, true);
        return;
      }
      if (command === 'editor-send' && authoring) {
        auto = false;
        paused = false;
        lastEditorPreview = structuredClone(data || {});
        enqueue(editorMessage(data), true);
        return;
      }
      if (command === 'editor-preview' && authoring) {
        lastEditorPreview = structuredClone(data || {});
        createEditorPreview(lastEditorPreview);
        return;
      }
      if (command === 'editor-seek' && authoring) {
        if (!messages.some((m) => m.kind === data?.kind))
          createEditorPreview(
            { ...lastEditorPreview, ...data, exitPreview: data?.phase === 'exit' },
            +data.ms,
            data?.phase,
          );
        else seekEditorPreview(data?.kind, data?.ms, data?.phase);
        return;
      }
      if (command === 'instance-snapshot' && editorDoc()) {
        clearMessages();
        liveMode = !!data?.liveMode;
        for (const item of data?.messages || []) {
          if (renderer().accepts(item)) release(true, item);
        }
        for (const m of messages) {
          const item = data.messages.find((x) => x._snapshotId === m._snapshotId);
          if (item) {
            const elapsed = data.paused
              ? 0
              : Math.max(0, Date.now() - (data.capturedAt || Date.now()));
            m.born = clock - item._snapshotAge - elapsed;
            if (Number.isFinite(item._snapshotExit)) m.noticeExitAt = m.born + item._snapshotExit;
            else delete m.noticeExitAt;
            if (m.kind === 'sc') m.timerStarted = clock - item._snapshotTimer - elapsed;
          }
        }
        for (const item of data?.queued || []) enqueue(item);
        arrange(0, true);
        needsDraw = true;
        return;
      }
      if (command === 'notice-settings') {
        noticeSettings = NoticeLifetime.normalize(data);
        return;
      }
      if (command === 'presentation') {
        present(data?.layout, !!data?.transition, data?.custom);
        return;
      }
      if (command === 'presentation-motion') {
        presentationMotion = {
          phase: ['move', 'enter'].includes(data?.phase) ? data.phase : 'idle',
          progress: clamp(data?.progress, 0, 1, 1),
        };
        needsDraw = true;
        return;
      }
      if (command === 'fleet-effects') {
        externalFleetSignal = !!data;
        needsDraw = true;
        return;
      }
      if (command === 'hello') {
        announceReady();
        return;
      }
      if (command === 'demo') {
        mainDemo();
        return;
      }
      if (command === 'zone-demo' && !liveMode) {
        mainDemo(true);
        return;
      }
      if (command === 'sc-carousel-demo' && !liveMode) {
        paused = false;
        auto = false;
        clearMessages();
        for (const m of [
          { kind: 'normal', sender: '白噪声', body: '通讯正在切换。' },
          { kind: 'sc', sender: '调查员 07', body: '前面有希斯，小心。', tier: 3, duration: 90 },
          {
            kind: 'sc',
            sender: '太古屋来客',
            body: '今晚继续探索。\n如果听见回声，先看一眼走廊。\n不要错过墙后的隐藏房间。',
            tier: 5,
            duration: 65,
          },
          {
            kind: 'sc',
            sender: '北极星',
            body: '信号已恢复。祝今晚直播顺利。',
            tier: 6,
            duration: 40,
          },
        ]) {
          if (m.kind === 'sc') m.fx = preset(m.tier);
          enqueue(m);
        }
        status('3 条 SC 已加入轮播，各自计时，约 7 秒切换一次。');
        return;
      }
      if (command === 'clear') {
        auto = false;
        clearMessages();
        return;
      }
      if (command === 'pause') {
        paused = !!data;
        last = 0;
        needsDraw = true;
        updateStatus();
        return;
      }
      if (command === 'latest') {
        followLatest();
        return;
      }
      if (command === 'auto' && !liveMode) {
        auto = !!data;
        if (auto) {
          paused = false;
          last = 0;
          nextAuto = clock + 200;
          following = true;
        }
        needsDraw = true;
        updateStatus();
        return;
      }
      if (command === 'fps') {
        if (Number.isInteger(data) && data >= 1 && data <= 240) {
          embedFPS = data;
          frameGate.reset();
        }
        return;
      }
      if (command === 'source') {
        liveMode = !!data;
        auto = false;
        paused = false;
        clearMessages();
        return;
      }
      if (command === 'live') {
        const accepted = acceptLive(data?.item || data || {});
        if (data?.receipt !== undefined)
          parent.postMessage(
            { channel: 'hiss-main-reply', type: 'receipt', receipt: data.receipt, accepted },
            location.origin,
          );
        return;
      }
      if (command === 'restore') {
        restoreLive(data);
        return;
      }
      if (command === 'delete') {
        if (Array.isArray(data)) removeLiveSC(data);
        return;
      }
      if (command === 'liveStatus') {
        livePhase = data?.phase || 'idle';
        liveRoomId = data?.roomId;
        needsDraw = true;
        updateStatus();
        return;
      }
      if (command === 'manual') {
        const item = data?.item || data;
        let accepted = false;
        if (!liveMode && item && ['normal', 'gift', 'sc', 'fleet'].includes(item.kind)) {
          const m = {
            kind: item.kind,
            sender: TextLimit.take(item.sender || '观众', 50),
            body: TextLimit.take(item.body || '', item.kind === 'normal' ? 300 : 1600),
          };
          if (m.kind === 'sc') {
            m.tier = Math.round(clamp(item.tier, 0, 6, 3));
            m.fx = preset(m.tier);
            m.duration = clamp(item.duration, 1, 7200, 180);
          }
          if (m.kind === 'fleet') {
            m.rank = FleetNotice.names[item.rank] ? item.rank : 'captain';
            m.body = '开通' + FleetNotice.names[m.rank];
          }
          if (m.kind === 'gift') {
            m.giftName = TextLimit.take(item.giftName || '能量电池', 60);
            m.quantity = Math.round(clamp(item.quantity, 1, 999999, 1));
            m.value = Math.round(clamp(item.value, 0, 999999999, 1000));
            m.body = giftBody(m);
          }
          accepted = enqueue(m, true);
          if (accepted) {
            following = true;
            needsDraw = true;
          }
        }
        if (data?.receipt !== undefined)
          parent.postMessage(
            { channel: 'hiss-main-reply', type: 'manual-receipt', receipt: data.receipt, accepted },
            location.origin,
          );
        return;
      }
    });
    // Ordinary messages and SC do not depend on the fleet/gift image downloads.
    announceReady();
    resize();
  } else if (new URLSearchParams(location.search).get('pure') === '1') pure(true);
})();
