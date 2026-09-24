(() => {
  'use strict';
  const frameGate = FrameRate.gate();
  const $ = (id) => document.getElementById(id),
    canvas = $('screen'),
    ctx = canvas.getContext('2d', { alpha: false });
  let age = 0,
    playing = true,
    last = 0,
    dirty = true,
    loopHold = 0,
    width = 440,
    sceneHeight = 0,
    zoom = 1,
    dpr = 1,
    model,
    older,
    newY = 0;
  function controls() {
    $('pause').textContent = playing ? '暂停' : age >= 220 ? '已落定' : '继续';
    $('pause').disabled = !playing && age >= 220;
  }
  function resize() {
    width = +$('width').value;
    const fontSize = +$('fontSize').value;
    model = NormalNotice.measure({
      sender: $('sender').value.trim() || '观众',
      body: $('message').value,
      width,
      fontSize,
    });
    older = NormalNotice.measure({ sender: '白噪声', body: '先去控制点，再继续探索太古屋。', width, fontSize });
    newY = older.height + 49;
    sceneHeight = newY + model.height + 28;
    const stage = $('stage');
    zoom = Math.max(
      0.2,
      Math.min(
        (stage.clientWidth - 48) / (width + 112),
        (stage.clientHeight - 48) / sceneHeight,
        $('view').value === 'actual' ? 1 : 2,
      ),
    );
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round((width + 112) * zoom * dpr);
    canvas.height = Math.round(sceneHeight * zoom * dpr);
    $('canvasShell').style.width = (width + 112) * zoom + 'px';
    $('canvasShell').style.height = sceneHeight * zoom + 'px';
    dirty = true;
  }
  function draw() {
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0);
    ctx.fillStyle = '#0e100f';
    ctx.fillRect(0, 0, width + 112, sceneHeight);
    NormalNotice.draw(ctx, { x: 83, y: 28, age: 220, model: older });
    NormalNotice.draw(ctx, { x: 83, y: newY, age, model });
    $('time').textContent = Math.round(age) + ' / 220 ms';
    $('timeline').value = Math.round(age);
    $('phase').textContent = NormalNotice.phase(age);
    document
      .querySelectorAll('[data-time]')
      .forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.time - age) < 1)));
    canvas.setAttribute(
      'aria-label',
      ($('sender').value || '观众') +
        '：' +
        $('message').value +
        '；' +
        NormalNotice.phase(age) +
        '；' +
        Math.round(age) +
        ' 毫秒',
    );
    dirty = false;
  }
  function seek(t, resume = false) {
    age = Math.max(0, Math.min(220, t));
    playing = resume;
    last = 0;
    loopHold = 0;
    dirty = true;
    controls();
  }
  function tick(now) {
    const dt = last ? Math.min(80, Math.max(0, now - last)) : 0;
    last = now;
    if (playing) {
      if (age < 220) {
        age = Math.min(220, age + dt * +$('speed').value);
        dirty = true;
        if (age === 220) {
          if (!$('loop').checked) playing = false;
          controls();
        }
      } else if ($('loop').checked) {
        loopHold += dt;
        if (loopHold >= 1200) seek(0, true);
      } else {
        playing = false;
        controls();
      }
    }
    if (dirty && frameGate.due(now)) draw();
    requestAnimationFrame(tick);
  }
  $('replay').addEventListener('click', () => seek(0, true));
  $('pause').addEventListener('click', () => {
    playing = !playing;
    last = 0;
    controls();
  });
  $('timeline').addEventListener('input', () => seek(+$('timeline').value));
  document
    .querySelectorAll('[data-time]')
    .forEach((b) => b.addEventListener('click', () => seek(+b.dataset.time)));
  for (const id of ['sender', 'message']) $(id).addEventListener('input', resize);
  for (const id of ['width', 'fontSize', 'view']) $(id).addEventListener('change', resize);
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
  new ResizeObserver(resize).observe($('stage'));
  resize();
  controls();
  requestAnimationFrame(tick);
})();
