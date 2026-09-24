/* One iframe, one message clock; reflow happens only behind the exit. */
(() => {
  'use strict';
  const scene = document.getElementById('scene'),
    select = document.getElementById('layoutSelect');
  if (!scene || !select) return;
  const params = new URLSearchParams(location.search),
    obs = params.has('obs'),
    key = 'hiss-main-layout-v1',
    C = LiveLayoutConfig,
    M = LiveLayoutMotion;
  let saved = 'classic';
  try {
    if (!obs) saved = localStorage.getItem(key) || saved;
  } catch {}
  // Custom composition belongs to the editor and its published OBS output.
  // The standalone live preview offers only the three finished layouts.
  const allowCustom = params.has('editor') || params.has('theme') || params.has('live') || obs ||
    new URLSearchParams(location.hash.slice(1)).has('theme');
  const normalize = (value) => {
    const next = C.normalize(value);
    return next === 'custom' && (!allowCustom || !window.CustomLayout) ? 'classic' : next;
  };
  let mode = normalize(params.get('layout') || saved),
    game = { ...C.get(mode).game },
    running = false,
    pending = null,
    job = 0,
    advance = null;
  const frame = document.getElementById('chatFrame'),
    windowEl = document.getElementById('gameWindow'),
    panel = document.querySelector('.chat-panel');
  const backdrop = document.querySelector('.scene-background path'),
    trace = document.querySelector('.game-trace'),
    traceRect = trace.querySelector('rect');
  const labels = [
    ...scene.querySelectorAll('.broadcast-header,.game-logos,.broadcast-timer,.now-playing-slot'),
  ];
  const material = scene.querySelector('.frame-material'),
    paper = scene.querySelector('.scene-background'),
    rules = scene.querySelector('.print-rules');
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.classList.add('layout-transition');
  overlay.setAttribute('viewBox', '0 0 1920 1080');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  overlay.innerHTML = '<rect pathLength="1000"/>';
  scene.append(overlay);
  const guides = document.createElement('div');
  guides.className = 'zone-guides';
  guides.setAttribute('aria-hidden', 'true');
  for (const [kind, z] of Object.entries(C.zones)) {
    const box = document.createElement('div');
    box.className = 'zone-guide';
    box.dataset.zone = kind;
    Object.assign(box.style, {
      left: z.x + 'px',
      top: z.y + 'px',
      width: z.w + 'px',
      height: z.h + 'px',
    });
    const name = document.createElement('span');
    name.textContent = z.name;
    box.append(name);
    guides.append(box);
  }
  scene.append(guides);
  document
    .getElementById('zoneGuides')
    .addEventListener(
      'change',
      (e) => (scene.dataset.zoneGuides = String(!obs && e.target.checked)),
    );
  const edge = overlay.firstElementChild,
    buttons = [...document.querySelectorAll('[data-layout-choice]')];
  function geometry(r) {
    game = { ...r };
    Object.assign(windowEl.style, {
      left: r.x + 'px',
      top: r.y + 'px',
      width: r.w + 'px',
      height: r.h + 'px',
    });
    backdrop.setAttribute(
      'd',
      `M0 0H1920V1080H0Z M${r.x} ${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x}Z`,
    );
    trace.setAttribute('viewBox', `0 0 ${r.w + 2} ${r.h + 2}`);
    traceRect.setAttribute('width', r.w);
    traceRect.setAttribute('height', r.h);
    rules
      .querySelector('.ink-light')
      .setAttribute(
        'd',
        `M${r.x} ${r.y}h74 M${r.x + r.w} ${r.y + 21}v36 M${r.x} ${r.y + r.h - 60}v60h47 M${r.x + r.w - 67} ${r.y + r.h}h67`,
      );
    rules
      .querySelector('.ink-break')
      .setAttribute('d', `M${r.x + 217} ${r.y}h3 M${r.x + r.w} ${r.y + r.h * 0.65}v3`);
    window.LiveMaterial?.setGeometry(r);
  }
  function post(command, data) {
    frame.contentWindow?.postMessage({ channel: 'hiss-main', command, data }, location.origin);
  }
  function feed() {
    post('presentation', { layout: mode, transition: running, custom: window.CustomLayout?.zones });
  }
  function ui() {
    document.getElementById('scCarouselDemo').hidden = !['split', 'custom'].includes(mode);
    document.getElementById('zoneReplay').hidden = !['split', 'custom'].includes(mode);
    document.getElementById('zoneGuidesOption').hidden = !['split', 'custom'].includes(mode);
    select.value = mode;
    for (const b of buttons)
      b.setAttribute('aria-pressed', String(b.dataset.layoutChoice === mode));
    const g = C.get(mode).game;
    document.getElementById('layoutGeometry').textContent =
      `游戏采集：位置 ${g.x}, ${g.y} · 尺寸 ${g.w} × ${g.h}`;
    document.getElementById('capturePosition').textContent = `${g.x}, ${g.y}`;
    document.getElementById('captureSize').textContent = `${g.w} × ${g.h}`;
    document.getElementById('layoutHint').textContent =
      mode === 'custom'
        ? '各区域独立排版，可拖动、缩放，移除或添加元素。'
        : mode === 'classic'
          ? '完整品牌区与宽弹幕栏。'
          : mode === 'game'
            ? '游戏占画布约 72%，窄栏重新排版；无需预留音乐栏。'
            : '右侧聊天与 SC 轮播 · 左下礼物 · 正中偏上上舰。上舰干扰可覆盖全画面。';
    document.getElementById('nowPlayingHint').textContent =
      mode === 'classic'
        ? '开启后，音乐位于左下角，直播时长与中英双 Logo 排列在右侧。'
        : '可选悬浮音乐组件；关闭时不留空位，也不改变游戏大小。';
  }
  function commit(next, persist) {
    mode = next;
    scene.dataset.layout = mode;
    const target = C.get(mode),
      p = target.panel;
    Object.assign(panel.style, {
      left: p.x + 'px',
      top: p.y + 'px',
      width: p.w + 'px',
      height: p.h + 'px',
    });
    window.LiveMaterial?.setLayout(target);
    window.dispatchEvent(new Event('live-layout-change'));
    ui();
    feed();
    if (persist && !obs)
      try {
        localStorage.setItem(key, mode);
      } catch {}
    const url = new URL(location.href);
    if (url.searchParams.has('layout')) {
      url.searchParams.set('layout', mode);
      history.replaceState(null, '', url);
    }
  }
  function clearMotion() {
    for (const el of [panel, ...labels]) {
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
    }
    for (const el of [material, paper, rules]) {
      el.style.removeProperty('display');
      el.style.removeProperty('opacity');
    }
    scene.style.removeProperty('--layout-border-alpha');
    delete scene.dataset.layoutSwitching;
    delete scene.dataset.layoutPhase;
    delete scene.dataset.layoutProgress;
    overlay.hidden = true;
    window.CustomLayout?.apply();
    post('presentation-motion', { phase: 'idle', progress: 1 });
  }
  function change(value, animated = true, persist = true) {
    const next = normalize(value);
    // Complete the current curve instead of canceling at an arbitrary velocity.
    if (running && animated) {
      pending = { next, persist };
      select.value = next;
      return;
    }
    if (next === mode && scene.dataset.layout === mode && !running) {
      ui();
      return;
    }
    const from = mode,
      previous = { ...game },
      target = C.get(next),
      token = ++job;
    const motion =
      animated &&
      window.LiveMotion?.enabled !== false &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!motion) {
      running = false;
      pending = null;
      advance = null;
      clearMotion();
      commit(next, persist);
      geometry(target.game);
      return;
    }
    running = true;
    pending = null;
    scene.dataset.layoutSwitching = 'true';
    overlay.hidden = false;
    const p = M.plan(from, next),
      gate = window.FrameRate?.gate();
    if (gate && obs && params.has('fps'))
      gate.getLimit = () => Math.max(1, Math.min(240, Number(params.get('fps')) || 60));
    const start = performance.now();
    let committed = false;
    for (const el of [material, paper, rules]) {
      el.style.display = 'block';
      el.style.opacity = ['split', 'custom'].includes(from) ? '0' : '1';
    }
    scene.style.setProperty('--layout-border-alpha', ['split', 'custom'].includes(from) ? 0 : 1);
    function tick(now, coordinated = false) {
      if (token !== job) return;
      const age = now - start,
        s = M.sample(p, age);
      if (coordinated || !gate || gate.due(now) || s.done) {
        scene.dataset.layoutPhase = s.phase;
        scene.dataset.layoutProgress = String(Math.min(1, age / p.total).toFixed(4));
        if (s.commit && !committed) {
          panel.style.opacity = '0';
          labels.forEach((el) => (el.style.opacity = '0'));
          commit(next, persist);
          committed = true;
        }
        const r = {};
        for (const k of ['x', 'y', 'w', 'h'])
          r[k] = previous[k] + (target.game[k] - previous[k]) * s.geometry;
        geometry(r);
        const amount = ['split', 'custom'].includes(from)
          ? s.geometry
          : ['split', 'custom'].includes(next)
            ? 1 - s.geometry
            : 1;
        material.style.opacity = String(amount);
        paper.style.opacity = String(amount);
        rules.style.opacity = String(amount);
        scene.style.setProperty('--layout-border-alpha', amount);
        panel.style.opacity = String(s.visibility);
        panel.style.transform = ['split', 'custom'].includes(mode)
          ? 'none'
          : `translateY(${s.phase === 'exit' ? -12 * (1 - s.visibility) : s.phase === 'enter' ? 14 * (1 - s.visibility) : 0}px)`;
        labels.forEach((el, i) => {
          const v =
            s.phase === 'enter' ? M.ease((s.enter - i * 0.035) / (1 - i * 0.035)) : s.visibility;
          el.style.opacity = String(v);
          el.style.transform = `translateY(${(s.phase === 'exit' ? -6 : 8) * (1 - v)}px)`;
        });
        if (committed) post('presentation-motion', { phase: s.phase, progress: s.enter });
        for (const [k, v] of Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h }))
          edge.setAttribute(k, v);
        edge.style.strokeDasharray = '72 1000';
        edge.style.strokeDashoffset = String(-s.geometry * 1000);
        edge.style.opacity = String(Math.sin(Math.PI * s.geometry) * 0.46);
      }
      if (!s.done) {
        if (!coordinated) requestAnimationFrame(tick);
      } else {
        running = false;
        advance = null;
        geometry(target.game);
        clearMotion();
        ui();
        const queued = pending;
        pending = null;
        if (queued && queued.next !== mode) change(queued.next, true, queued.persist);
      }
    }
    advance = tick;
    if (!window.LiveMotion) requestAnimationFrame(tick);
  }
  window.LiveLayout = {
    get current() {
      return mode;
    },
    get game() {
      return game;
    },
    get config() {
      return C.get(mode);
    },
    get transitioning() {
      return running;
    },
    advance: (now) => advance?.(now, true),
    change,
    feed,
    refreshCustom() {
      if (mode !== 'custom' || running) return;
      geometry(C.get(mode).game);
      ui();
      feed();
      for (const [kind, r] of Object.entries(C.zones)) {
        const z = C.zone(kind, mode),
          el = guides.querySelector('[data-zone="' + kind + '"]');
        Object.assign(el.style, {
          left: z.x + 'px',
          top: z.y + 'px',
          width: z.w + 'px',
          height: z.h + 'px',
        });
      }
    },
  };
  window.addEventListener('message', (e) => {
    if (
      e.source === frame.contentWindow &&
      e.origin === location.origin &&
      e.data?.channel === 'hiss-main-reply' &&
      e.data.type === 'zone-layout' &&
      Number.isFinite(e.data.scY)
    ) {
      guides.querySelector('[data-zone="sc"]').style.top = e.data.scY + 'px';
    }
  });
  select.addEventListener('change', () => change(select.value));
  buttons.forEach((b) => b.addEventListener('click', () => change(b.dataset.layoutChoice)));
  window.addEventListener('storage', (e) => {
    if (!obs && e.key === key) change(e.newValue, true, false);
  });
  frame.addEventListener('load', feed);
  window.addEventListener('message', (e) => {
    if (
      e.source === frame.contentWindow &&
      e.origin === location.origin &&
      e.data?.channel === 'hiss-main-reply' &&
      e.data.type === 'ready'
    )
      feed();
  });
  window.addEventListener('pagehide', () => {
    job++;
  });
  change(mode, false, false);
})();
