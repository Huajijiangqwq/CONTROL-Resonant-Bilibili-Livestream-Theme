(() => {
  'use strict';
  const frameGate = FrameRate.gate();
  const $ = (id) => document.getElementById(id),
    canvas = $('screen'),
    ctx = canvas.getContext('2d', { alpha: false }),
    family = '"Microsoft YaHei","Segoe UI",sans-serif';
  let age = 0,
    playing = false,
    last = 0,
    dirty = true,
    width = 440,
    sceneHeight = 0,
    zoom = 1,
    dpr = 1,
    loopHold = 0,
    updateAge = -1,
    previous = {};
  const bounded = (v, min, max, fallback) =>
    Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.round(Number(v)))) : fallback;
  let previewData;
  function data() {
    const giftName = $('giftName').value.trim() || '礼物名称',
      sender = $('sender').value.trim() || '观众',
      quantity = bounded($('quantity').value, 1, 999999, 10),
      value = bounded($('value').value, 0, 999999999, 1000);
    // Keep a stable snapshot for the layout cache; create a new one on edits so
    // the previous combo values remain available throughout their animation.
    if (
      !previewData ||
      previewData.giftName !== giftName ||
      previewData.sender !== sender ||
      previewData.quantity !== quantity ||
      previewData.value !== value
    )
      previewData = { giftName, sender, quantity, value };
    return previewData;
  }
  function context(y, name, text) {
    ctx.fillStyle = '#9ca99f';
    ctx.font = '16px ' + family;
    ctx.textBaseline = 'top';
    ctx.fillText(name, 53, y);
    ctx.strokeStyle = '#92d1bd';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(28, y + 3);
    ctx.lineTo(38, y + 3);
    ctx.lineTo(33, y + 12);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#e5e8df';
    ctx.font = '21px ' + family;
    ctx.fillText(text, 28, y + 29);
    ctx.strokeStyle = '#2d3630';
    ctx.beginPath();
    ctx.moveTo(28, y + 68);
    ctx.lineTo(width + 20, y + 68);
    ctx.stroke();
  }
  function draw() {
    const item = data();
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
    ctx.fillStyle = '#0e100f';
    ctx.fillRect(0, 0, width + 48, sceneHeight);
    context(26, '白噪声', '先去控制点，再继续探索太古屋。');
    GiftNotice.draw(ctx, { x: 24, y: 119, width, age, data: item, updateAge, previous });
    context(145 + GiftNotice.height(width, item), '调查员 12', '收到。');
    $('time').textContent = Math.round(age) + ' / 800 ms';
    $('timeline').value = Math.round(age);
    $('phase').textContent =
      updateAge >= 0 && updateAge < 340 ? '连击 · 数量与价值更新' : GiftNotice.phase(age);
    document
      .querySelectorAll('[data-time]')
      .forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.time - age) < 1)));
    canvas.setAttribute(
      'aria-label',
      item.giftName +
        '，赠送者 ' +
        item.sender +
        '，数量 ' +
        item.quantity +
        '，价值 ' +
        item.value +
        ' 电池；' +
        $('phase').textContent +
        '；' +
        Math.round(age) +
        ' 毫秒',
    );
    dirty = false;
  }
  function resize() {
    width = +$('width').value;
    sceneHeight = GiftNotice.height(width, data()) + 257;
    const stage = $('stage');
    zoom = Math.max(
      0.2,
      Math.min(
        (stage.clientWidth - 32) / (width + 48),
        (stage.clientHeight - 28) / sceneHeight,
        $('view').value === 'actual' ? 1 : 1.9,
      ),
    );
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round((width + 48) * zoom * dpr);
    canvas.height = Math.round(sceneHeight * zoom * dpr);
    $('canvasShell').style.width = (width + 48) * zoom + 'px';
    $('canvasShell').style.height = sceneHeight * zoom + 'px';
    dirty = true;
  }
  function controls() {
    const active = age < 800 || (updateAge >= 0 && updateAge < 340);
    $('pause').textContent = playing ? '暂停' : active ? '继续' : '已稳定';
    $('pause').disabled = !playing && !active;
    $('combo').disabled =
      age < 800 || (updateAge >= 0 && updateAge < 340) || data().quantity >= 999999;
  }
  function seek(t, resume = false) {
    age = Math.max(0, Math.min(800, t));
    playing = resume;
    last = 0;
    loopHold = 0;
    updateAge = -1;
    dirty = true;
    controls();
  }
  function tick(now) {
    const dt = last ? Math.min(80, now - last) : 0;
    last = now;
    if (playing) {
      if (updateAge >= 0 && updateAge < 340) {
        updateAge = Math.min(340, updateAge + dt * +$('speed').value);
        dirty = true;
        if (updateAge === 340) {
          playing = false;
          controls();
        }
      } else if (age < 800) {
        age = Math.min(800, age + dt * +$('speed').value);
        dirty = true;
        if (age === 800) {
          if (!$('loop').checked) playing = false;
          controls();
        }
      } else if ($('loop').checked) {
        loopHold += dt;
        if (loopHold >= 1400) seek(0, true);
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
  for (const name of ['giftName', 'sender', 'quantity', 'value'])
    $(name).addEventListener('input', () => {
      updateAge = -1;
      resize();
      controls();
    });
  for (const name of ['quantity', 'value'])
    $(name).addEventListener('change', () => {
      const item = data();
      $(name).value = item[name];
      resize();
    });
  for (const name of ['width', 'view']) $(name).addEventListener('change', resize);
  $('combo').addEventListener('click', () => {
    previous = data();
    if (previous.quantity >= 999999) return;
    $('quantity').value = previous.quantity + 1;
    $('value').value = Math.min(
      999999999,
      previous.value + Math.round(previous.value / previous.quantity),
    );
    updateAge = 0;
    loopHold = 0;
    playing = true;
    last = 0;
    controls();
    dirty = true;
  });
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
  GiftNotice.loading.then((ok) => {
    $('ready').textContent = ok ? '物证照片已就绪 · 本地预览' : '照片未载入 · 使用示意轮廓';
    seek(0, true);
  });
  requestAnimationFrame(tick);
})();
