(() => {
  'use strict';
  const frameGate = FrameRate.gate(),
    $ = (id) => document.getElementById(id),
    canvas = $('screen'),
    c = canvas.getContext('2d', { alpha: true }),
    background = new Image();
  let age = 0,
    playing = true,
    last = 0,
    scale = 1,
    speed = 1,
    dpr = 1,
    dirty = true,
    view = { x: 855, y: 70, w: 850, h: 660 };
  const rank = () => $('rank').value,
    total = () => FleetNotice.duration(rank());
  function sync() {
    const done = age >= total();
    $('fbcMark').hidden = rank() !== 'governor';
    $('burnMark').hidden = rank() !== 'governor';
    $('pause').textContent = playing ? '暂停' : '继续';
    $('pause').disabled = false;
    $('time').textContent =
      (Math.min(age, total()) / 1000).toFixed(2) + ' / ' + (total() / 1000).toFixed(2) + ' s';
    $('timeline').max = total();
    $('timeline').value = Math.round(Math.min(age, total()));
    $('phase').textContent = FleetNotice.phase(age, rank());
    $('ready').textContent = FleetNotice.failed
      ? '动态材质未载入 · 保留图形与细碎光'
      : '本地预览 · ' +
        (total() / 1000).toFixed(1) +
        ' 秒入场' +
        (rank() === 'governor' ? ' · 含档案徽记停留1.5秒' : '') +
        (done ? ' · 微光留驻' : '');
  }
  function draw() {
    dirty = false;
    const W = canvas.width / dpr,
      H = canvas.height / dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const mode = $('background').value;
    if (mode === 'game' && background.complete && background.naturalWidth)
      c.drawImage(
        background,
        (view.x / 2558) * background.width,
        (view.y / 1436) * background.height,
        (view.w / 2558) * background.width,
        (view.h / 1436) * background.height,
        0,
        0,
        W,
        H,
      );
    else if (mode !== 'transparent') {
      c.fillStyle = mode === 'light' ? '#777c8b' : mode === 'chat' ? '#0e100f' : '#10131d';
      c.fillRect(0, 0, W, H);
    }
    if (mode === 'chat') {
      const textSize = Math.max(12, W * 0.029);
      c.save();
      c.textAlign = 'left';
      c.textBaseline = 'top';
      for (const [sender, body, yy] of [
        ['白噪声', '先去控制点，再继续探索太古屋。', H * 0.03],
        ['小北', '欢迎加入舰队！', H * 0.865],
      ]) {
        c.font = '400 ' + textSize * 0.76 + 'px "Microsoft YaHei",sans-serif';
        c.fillStyle = '#91aaa6';
        c.fillText('▽  ' + sender, W * 0.07, yy);
        c.font = '600 ' + textSize + 'px "Microsoft YaHei",sans-serif';
        c.fillStyle = '#e5e9e6';
        c.fillText(body, W * 0.07, yy + textSize);
        c.strokeStyle = '#34413b';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(W * 0.07, yy + textSize * 2.5);
        c.lineTo(W * 0.93, yy + textSize * 2.5);
        c.stroke();
      }
      c.restore();
    }
    const ratio = W / view.w;
    c.save();
    c.scale(ratio, ratio);
    c.translate(-view.x, -view.y);
    FleetNotice.draw(c, {
      x: 850 + 429.5 * (1 - scale),
      y: 380 * (1 - scale),
      scale,
      rank: rank(),
      username: $('subtitle').value,
      age,
    });
    c.restore();
    const signalX = Math.max(0, (850 - view.x) * ratio),
      signalY = Math.max(0, (70 - view.y) * ratio);
    FleetNotice.drawSignal(c, {
      x: signalX,
      y: signalY,
      width: Math.min(W - signalX, 850 * ratio),
      height: Math.min(H - signalY, 660 * ratio),
      quality: dpr,
      age,
      rank: rank(),
      focusX: (850 + 429.5 - view.x) * ratio,
      focusY: (350 - view.y) * ratio,
    });
    sync();
    canvas.setAttribute(
      'aria-label',
      '开通' +
        FleetNotice.names[rank()] +
        '，' +
        $('subtitle').value +
        '；' +
        FleetNotice.phase(age, rank()) +
        '；' +
        Math.round(age) +
        '毫秒',
    );
  }
  function resize() {
    view =
      $('view').value === 'full'
        ? { x: 0, y: 0, w: 2558, h: 1436 }
        : { x: 855, y: 70, w: 850, h: 660 };
    const stage = $('stage'),
      ratio = Math.min((stage.clientWidth - 24) / view.w, (stage.clientHeight - 24) / view.h),
      w = Math.max(180, view.w * ratio),
      h = (w * view.h) / view.w;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    $('canvasShell').style.width = w + 'px';
    $('canvasShell').style.height = h + 'px';
    $('viewLabel').textContent = $('view').value === 'full' ? '16:9 全画面 · 原片位置' : '提示特写';
    $('canvasShell').classList.toggle('checker', $('background').value === 'transparent');
    dirty = true;
    draw();
  }
  function seek(t, resume = false) {
    age = Math.max(0, Math.min(total(), t));
    playing = resume;
    last = 0;
    dirty = true;
    draw();
  }
  function tick(now) {
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    if (playing) {
      age += dt * speed;
      if ($('loop').checked && age > total() + 1800) age = 0;
      dirty = true;
    }
    if (dirty && frameGate.due(now)) draw();
    requestAnimationFrame(tick);
  }
  $('replay').addEventListener('click', () => seek(0, true));
  $('pause').addEventListener('click', () => {
    playing = !playing;
    last = 0;
    sync();
  });
  $('timeline').addEventListener('input', () => seek(+$('timeline').value));
  document.querySelectorAll('[data-time]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.time === 'burn') {
        seek(FleetInterlude.cutAt - FleetInterlude.lead * 0.28);
        return;
      }
      if (b.dataset.time === 'fbc') {
        seek(FleetInterlude.cutAt + FleetInterlude.hold * 0.5);
        return;
      }
      const p = { 80: 0.1, 210: 0.23, 290: 0.309, 550: 0.55, 1800: 1 }[b.dataset.time],
        t = FleetNotice.baseDuration(rank()) * p;
      seek(t + (rank() === 'governor' && t > FleetInterlude.cutAt ? FleetInterlude.hold : 0));
    }),
  );
  $('subtitle').addEventListener('input', () => {
    dirty = true;
  });
  $('rank').addEventListener('change', () => {
    $('title').value = '开通' + FleetNotice.names[rank()];
    seek(0, true);
  });
  $('speed').addEventListener('change', () => {
    speed = +$('speed').value;
  });
  $('scale').addEventListener('input', () => {
    scale = +$('scale').value / 100;
    $('scaleValue').textContent = $('scale').value + '%';
    dirty = true;
  });
  for (const id of ['view', 'background']) $(id).addEventListener('change', resize);
  function pure(on) {
    document.body.classList.toggle('pure', on);
    resize();
  }
  $('pure').addEventListener('click', () => pure(true));
  $('back').addEventListener('click', () => pure(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') pure(false);
  });
  document.addEventListener('visibilitychange', () => {
    last = 0;
  });
  window.addEventListener('pagehide', () => window.FleetVHS?.dispose(c));
  new ResizeObserver(resize).observe($('stage'));
  background.onload = () => {
    dirty = true;
  };
  background.src = 'live-game.jpg';
  $('replay').disabled = true;
  resize();
  FleetNotice.loading.then(() => {
    $('replay').disabled = false;
    seek(0, true);
  });
  requestAnimationFrame(tick);
})();
