/* Main HUD motion. All authored animations are paused and sampled through the
   same frame gate as the chat, so a 30 FPS/custom cap also applies to the frame. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s),
    params = new URLSearchParams(location.search),
    storageKey = 'hiss-main-motion-v1',
    obs = params.has('obs');
  let enabled = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) enabled = saved !== 'off';
  } catch {}
  if (params.has('motion')) enabled = params.get('motion') !== '0';
  const fixedFPS = Number(params.get('fps')),
    gate = FrameRate.gate();
  if (obs && Number.isInteger(fixedFPS) && fixedFPS >= 1 && fixedFPS <= 240)
    gate.getLimit = () => fixedFPS;
  let tracks = [],
    started = performance.now(),
    clock = 0,
    topicDelay = 0,
    nameDelay = 0,
    noticeAt = {};
  const wipe = [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }];
  function add(
    element,
    frames,
    duration,
    delay = 0,
    easing = 'linear',
    repeat = false,
    tag = 'intro',
  ) {
    if (!element) return;
    const a = element.animate(frames, {
      duration,
      delay,
      easing,
      iterations: repeat ? Infinity : 1,
      fill: tag === 'ambient' ? 'none' : 'both',
    });
    a.playbackRate = 0;
    a.pause();
    a.currentTime = 0;
    tracks.push({ a, origin: clock, end: repeat ? Infinity : duration + delay, done: false, tag });
    return a;
  }
  function remove(tag) {
    tracks = tracks.filter((t) => {
      if (t.tag !== tag) return true;
      t.a.cancel();
      return false;
    });
  }
  function sync() {
    const checkbox = $('#hudMotion');
    if (checkbox) checkbox.checked = enabled;
    $('#scene').dataset.motion = enabled ? 'on' : 'off';
    $('#motionHint').textContent = enabled
      ? '分拍入场 · 印刷颗粒 · 边角持续共振。'
      : '界面动效已关闭，弹幕动画独立播放。';
  }
  function replay() {
    for (const t of tracks) t.a.cancel();
    tracks = [];
    started = performance.now();
    clock = 0;
    gate.reset();
    noticeAt = {};
    window.LiveMaterial?.resetPulse();
    if (!enabled) {
      window.LiveMaterial?.draw(0);
      sync();
      return;
    }
    add(
      $('.header-triangle'),
      [
        { transform: 'rotate(-120deg)', opacity: 0.25 },
        { transform: 'rotate(-42deg)', opacity: 1, offset: 0.34 },
        { transform: 'rotate(0deg)', opacity: 1 },
      ],
      450,
      20,
      'cubic-bezier(.2,.85,.3,1)',
    );
    add($('.header-rule'), wipe, 560, 80, 'cubic-bezier(.65,0,.2,1)');
    add($('#hostText'), wipe, 380, 130, 'steps(5,end)', false, 'name');
    add(
      $('#topicText'),
      [
        { clipPath: 'inset(0 100% 0 0)', filter: 'brightness(1.6)' },
        { clipPath: 'inset(0 0 0 0)', filter: 'brightness(1)', offset: 1 },
      ],
      420,
      230,
      'steps(5,end)',
      false,
      'title',
    );
    add($('.chat-heading'), wipe, 390, 290, 'steps(5,end)');
    add(
      $('.chat-rule'),
      [{ clipPath: 'inset(-10px 100% -10px 0)' }, { clipPath: 'inset(-10px 0 -10px 0)' }],
      430,
      430,
      'cubic-bezier(.6,0,.15,1)',
    );
    add($('.broadcast-timer'), wipe, 360, 500, 'steps(5,end)');
    document.querySelectorAll('.logo-group svg').forEach((logo, i) =>
      add(
        logo,
        [
          { clipPath: 'inset(100% 0 0 0)', opacity: 0.7 },
          { clipPath: 'inset(0 0 0 0)', opacity: 1 },
        ],
        440,
        650 + i * 120,
        'steps(6,end)',
      ),
    );
    add($('.broadcast-statement'), wipe, 520, 650, 'steps(6,end)');
    add(
      $('.logo-divider'),
      [{ clipPath: 'inset(50% 0 50% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
      420,
      820,
      'cubic-bezier(.25,.8,.3,1)',
    );
    document.querySelectorAll('.corner').forEach((corner, i) => {
      add(
        corner,
        [
          { opacity: 0 },
          { opacity: 0.45, offset: 0.22 },
          { opacity: 1, offset: 0.27 },
          { opacity: 0.25, offset: 0.46 },
          { opacity: 1, offset: 0.52 },
          { opacity: 0.85 },
        ],
        420,
        90 + i * 90,
        'steps(1,end)',
      );
      add(
        corner,
        [
          { opacity: 0.85 },
          { opacity: 0.85, offset: 0.55 },
          { opacity: 0.32, offset: 0.57 },
          { opacity: 0.95, offset: 0.59 },
          { opacity: 0.95, offset: 0.61 },
          { opacity: 0.55, offset: 0.65 },
          { opacity: 0.85, offset: 0.68 },
          { opacity: 0.85 },
        ],
        8500,
        1700 + i * 350,
        'linear',
        true,
        'ambient',
      );
    });
    add(
      $('.game-trace rect'),
      [
        { strokeDashoffset: 1000, opacity: 0 },
        { strokeDashoffset: 980, opacity: 0.85, offset: 0.02 },
        { strokeDashoffset: 45, opacity: 0.85, offset: 0.95 },
        { strokeDashoffset: 0, opacity: 0 },
      ],
      9500,
      1000,
      'linear',
      true,
      'ambient',
    );
    add(
      $('.on-air i'),
      [
        { opacity: 0.65, boxShadow: '0 0 8px #ff34342a' },
        { opacity: 1, boxShadow: '0 0 24px #ff343475', offset: 0.24 },
        { opacity: 0.82, boxShadow: '0 0 12px #ff343437', offset: 0.5 },
        { opacity: 0.65, boxShadow: '0 0 8px #ff34342a' },
      ],
      2700,
      500,
      'ease-in-out',
      true,
      'ambient',
    );
    document
      .querySelectorAll('.time-colon')
      .forEach((colon) =>
        add(
          colon,
          [{ opacity: 1 }, { opacity: 0.32, offset: 0.5 }, { opacity: 1 }],
          1000,
          1500,
          'steps(1,end)',
          true,
          'ambient',
        ),
      );
    add(
      $('.chat-sweep'),
      [
        { transform: 'translateX(-38px)', opacity: 0 },
        { transform: 'translateX(-10px)', opacity: 0.9, offset: 0.08 },
        { transform: 'translateX(143px)', opacity: 0, offset: 0.5 },
        { transform: 'translateX(143px)', opacity: 0 },
      ],
      4800,
      1300,
      'cubic-bezier(.3,0,.2,1)',
      true,
      'ambient',
    );
    add(
      $('.logo-signal'),
      [
        { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
        { clipPath: 'inset(0 0 0 0)', opacity: 0.8, offset: 0.08 },
        { clipPath: 'inset(0 0 0 0)', opacity: 0.4, offset: 0.3 },
        { clipPath: 'inset(0 0 0 100%)', opacity: 0, offset: 0.4 },
        { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
      ],
      9000,
      1600,
      'steps(5,end)',
      true,
      'ambient',
    );
    sync();
  }
  function updateText(tag, selector) {
    if (!enabled) return;
    remove(tag);
    add(
      $(selector),
      [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
      240,
      0,
      'steps(4,end)',
      false,
      tag,
    );
  }
  function notice(kind, tier) {
    if (
      !enabled ||
      !['sc', 'gift', 'fleet'].includes(kind) ||
      clock - (noticeAt[kind] ?? -Infinity) < 700
    )
      return;
    noticeAt[kind] = clock;
    $('#scene').dataset.notice = kind;
    remove('notice');
    add(
      $('.notice-signal'),
      [
        { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
        { clipPath: 'inset(0 12% 0 0)', opacity: 0.95, offset: 0.22 },
        { clipPath: 'inset(0 0 0 0)', opacity: 0.6, offset: 0.5 },
        { clipPath: 'inset(0 0 0 100%)', opacity: 0 },
      ],
      kind === 'sc' ? 1200 : kind === 'gift' ? 680 : 950,
      0,
      'steps(5,end)',
      false,
      'notice',
    );
    if (kind === 'sc') window.LiveMaterial?.pulse(tier);
    if (kind === 'fleet') {
      remove('notice-icon');
      add(
        $('.header-triangle'),
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(70deg)', offset: 0.22 },
          { transform: 'rotate(310deg)', offset: 0.67 },
          { transform: 'rotate(360deg)' },
        ],
        680,
        0,
        'cubic-bezier(.2,.75,.25,1)',
        false,
        'notice-icon',
      );
    }
  }
  function setEnabled(on) {
    enabled = !!on;
    if (!obs)
      try {
        localStorage.setItem(storageKey, enabled ? 'on' : 'off');
      } catch {}
    replay();
  }
  $('#hudMotion').addEventListener('change', (e) => setEnabled(e.target.checked));
  $('#replayHud').addEventListener('click', () => {
    if (!enabled) setEnabled(true);
    else replay();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey && !obs) {
      enabled = e.newValue !== 'off';
      replay();
    }
  });
  function tick(now) {
    clock = window.ThemeRenderer?.clock(now - started) ?? now - started;
    if (!document.hidden && gate.due(now)) {
      window.LiveLayout?.advance(now);
      if (enabled) {
        window.LiveMaterial?.draw(clock);
        for (const t of tracks) {
          if (t.done) continue;
          const age = clock - t.origin;
          t.a.currentTime = Math.min(age, t.end);
          if (age >= t.end) t.done = true;
        }
      }
    }
    requestAnimationFrame(tick);
  }
  window.LiveMotion = {
    replay,
    setEnabled,
    notice,
    get enabled() {
      return enabled;
    },
    topicUpdated() {
      clearTimeout(topicDelay);
      topicDelay = setTimeout(() => updateText('title', '#topicText'), 160);
    },
    nameUpdated() {
      clearTimeout(nameDelay);
      nameDelay = setTimeout(() => updateText('name', '#hostText'), 160);
    },
  };
  sync();
  requestAnimationFrame(tick);
})();
