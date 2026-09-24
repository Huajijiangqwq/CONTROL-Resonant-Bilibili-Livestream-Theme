/* The editable scene is kept separate from the three fixed compositions. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id),
    scene = $('scene'),
    C = CustomLayoutConfig,
    key = 'hiss-custom-layout-v1',
    params = new URLSearchParams(location.search),
    obs = params.has('obs');
  let raw = {};
  try {
    raw = JSON.parse(
      new URLSearchParams(location.hash.slice(1)).get('custom') ||
        (!obs && localStorage.getItem(key)) ||
        '{}',
    );
  } catch {}
  let state = C.normalize(raw),
    selected = 'normal',
    editing = false,
    drag = null,
    framePending = false,
    history = [],
    future = [];
  LiveLayoutConfig.setCustom(state);
  const nodes = {
    game: $('gameWindow'),
    header: scene.querySelector('.broadcast-header'),
    logos: scene.querySelector('.game-logos'),
    timer: scene.querySelector('.broadcast-timer'),
    music: $('nowPlayingSlot'),
  };
  const extraLayer = document.createElement('div');
  extraLayer.className = 'custom-extras';
  scene.append(extraLayer);
  const handles = document.createElement('div');
  handles.className = 'custom-handles';
  scene.append(handles);

  const lookup = (id) => state.elements[id] || state.extras.find((e) => e.id === id),
    name = (id) => C.names[id] || lookup(id)?.name || id;
  function say(text) {
    $('customStatus').textContent = text;
  }
  function checkpoint() {
    history.push(JSON.stringify(state));
    if (history.length > 40) history.shift();
    future = [];
    syncUndo();
  }
  function syncUndo() {
    $('customUndo').disabled = !history.length;
    $('customRedo').disabled = !future.length;
  }
  function persist() {
    if (obs) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
      say('布局已保存。修改后请重新复制 OBS 地址。');
    } catch {
      say('浏览器存储空间不足，请导出布局文件保存。');
    }
  }
  function geometry(node, r) {
    Object.assign(node.style, {
      left: r.x + 'px',
      top: r.y + 'px',
      right: 'auto',
      bottom: 'auto',
      width: r.w + 'px',
      height: r.h + 'px',
    });
  }
  function rebuildExtras() {
    const existing = new Map([...extraLayer.children].map((el) => [el.dataset.element, el]));
    for (const item of state.extras) {
      let el = existing.get(item.id);
      existing.delete(item.id);
      if (!el) {
        el = document.createElement(item.type === 'image' ? 'img' : 'div');
        el.className = 'custom-element';
        el.dataset.element = item.id;
        extraLayer.append(el);
      }
      geometry(el, item);
      el.hidden = !item.enabled;
      if (item.type === 'text') {
        el.textContent = item.text;
        Object.assign(el.style, {
          fontSize: item.size + 'px',
          fontWeight: item.weight,
          color: item.color,
        });
      } else {
        if (item.src) {
          if (el.getAttribute('src') !== item.src) el.src = item.src;
        } else el.removeAttribute('src');
        el.alt = item.name;
        el.onerror = () => {
          el.dataset.failed = 'true';
          say('图片无法加载，请检查地址，或使用本地图片。');
        };
        el.onload = () => delete el.dataset.failed;
      }
    }
    for (const el of existing.values()) el.remove();
  }
  function handlesUI() {
    handles.hidden =
      obs || !editing || scene.dataset.layout !== 'custom' || !!scene.dataset.layoutSwitching;
    const ids = [...Object.keys(state.elements), ...state.extras.map((x) => x.id)],
      existing = new Map([...handles.children].map((el) => [el.dataset.element, el]));
    for (const id of ids) {
      const item = lookup(id);
      let el = existing.get(id);
      existing.delete(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'custom-handle';
        el.dataset.element = id;
        const label = document.createElement('span');
        label.className = 'custom-handle-name';
        const size = document.createElement('i');
        size.dataset.resize = 'true';
        size.setAttribute('aria-label', '调整大小');
        el.append(label, size);
        handles.append(el);
      }
      geometry(el, item);
      el.hidden = !item.enabled;
      el.dataset.selected = String(id === selected);
      el.firstChild.textContent = name(id);
    }
    for (const el of existing.values()) el.remove();
  }
  function apply() {
    const active = scene.dataset.layout === 'custom';
    // Editing belongs to the dedicated theme editor, not the live preview.
    $('customEditor').hidden = true;
    extraLayer.hidden = !active;
    if (active && !window.ThemeRenderer?.active) {
      for (const [id, node] of Object.entries(nodes)) {
        const r = state.elements[id];
        if (id !== 'game') geometry(node, r);
        node.dataset.customHidden = String(!r.enabled);
        if (id === 'logos') node.style.setProperty('--logo-scale', Math.min(r.w / 1350, r.h / 90));
        if (id === 'header') node.style.setProperty('--custom-header-scale', r.h / 33);
        if (id === 'timer') node.style.setProperty('--custom-timer-scale', r.h / 43);
      }
      rebuildExtras();
    } else if (!active) {
      for (const [id, node] of Object.entries(nodes)) {
        delete node.dataset.customHidden;
        if (id !== 'game')
          for (const property of [
            'left',
            'top',
            'right',
            'bottom',
            'width',
            'height',
            '--logo-scale',
            '--custom-header-scale',
            '--custom-timer-scale',
          ])
            node.style.removeProperty(property);
      }
    }
    handlesUI();
  }
  function scheduleFeed() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      LiveLayoutConfig.setCustom(state);
      window.LiveLayout?.refreshCustom();
      apply();
    });
  }
  function update(next, { save = true, fields = true } = {}) {
    state = C.normalize(next);
    if (!lookup(selected)) selected = 'normal';
    LiveLayoutConfig.setCustom(state);
    scheduleFeed();
    if (fields) syncFields();
    if (save) persist();
  }
  function syncFields() {
    const picker = $('customElement'),
      ids = [...Object.keys(state.elements), ...state.extras.map((e) => e.id)];
    picker.replaceChildren(
      ...ids.map((id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name(id) + (lookup(id).enabled ? '' : ' · 已移除');
        return option;
      }),
    );
    picker.value = selected;
    const item = lookup(selected);
    $('customW').min = ['normal', 'sc', 'gift', 'fleet'].includes(selected) ? 160 : 24;
    for (const key of ['x', 'y', 'w', 'h']) $('custom' + key.toUpperCase()).value = item[key];
    $('customEnabled').checked = item.enabled;
    $('customTextFields').hidden = item.type !== 'text';
    $('customImageFields').hidden = item.type !== 'image';
    if (item.type === 'text') {
      for (const key of ['text', 'size', 'weight', 'color'])
        $('custom' + key[0].toUpperCase() + key.slice(1)).value = item[key];
    }
    if (item.type === 'image')
      $('customImageURL').value = item.src.startsWith('data:') ? '' : item.src;
    $('customGeometryHint').textContent =
      selected === 'game'
        ? '游戏窗口锁定为 16:9；OBS 的游戏源需要同步这些尺寸。'
        : selected === 'music'
          ? '音乐组件保持比例；显示内容沿用音乐皮肤设置。'
          : '坐标以 1920 × 1080 画布为准。拖动边框移动，拖动右下角调整大小。';
    handlesUI();
  }
  function patch(values, save = true) {
    const next = structuredClone(state);
    if (next.elements[selected]) Object.assign(next.elements[selected], values);
    else
      Object.assign(
        next.extras.find((x) => x.id === selected),
        values,
      );
    update(next, { save });
  }
  $('customElement').addEventListener('change', (e) => {
    selected = e.target.value;
    syncFields();
  });
  $('customEdit').addEventListener('change', (e) => {
    editing = e.target.checked;
    handlesUI();
  });
  for (const k of ['x', 'y', 'w', 'h'])
    $('custom' + k.toUpperCase()).addEventListener('change', (e) => {
      if (!e.target.value.trim()) {
        syncFields();
        return;
      }
      checkpoint();
      const value = +e.target.value;
      patch(
        (selected === 'game' || selected === 'music') && k === 'h'
          ? { w: value * (selected === 'game' ? 16 / 9 : 24 / 7) }
          : { [k]: value },
      );
    });
  $('customEnabled').addEventListener('change', (e) => {
    checkpoint();
    patch({ enabled: e.target.checked });
    if (selected === 'music' && e.target.checked && !$('nowPlayingEnabled').checked) {
      $('nowPlayingEnabled').checked = true;
      $('nowPlayingEnabled').dispatchEvent(new Event('change'));
    }
  });
  for (const key of ['text', 'size', 'weight', 'color'])
    $('custom' + key[0].toUpperCase() + key.slice(1)).addEventListener('change', (e) => {
      checkpoint();
      patch({ [key]: e.target.value });
    });
  for (const id of ['customText', 'customImageURL']) {
    let pending;
    $(id).addEventListener('input', () => {
      clearTimeout(pending);
      const target = selected;
      pending = setTimeout(() => {
        if (selected === target) $(id).dispatchEvent(new Event('change'));
      }, 180);
    });
  }
  $('customImageURL').addEventListener('change', (e) => {
    const src = C.safeImage(e.target.value);
    if (!src && e.target.value) {
      say('请填写 http(s) 图片地址，或主题文件夹内的相对路径。');
      return;
    }
    checkpoint();
    patch({ src });
  });
  $('customDelete').addEventListener('click', () => {
    checkpoint();
    if (state.elements[selected]) patch({ enabled: false });
    else update({ ...state, extras: state.extras.filter((e) => e.id !== selected) });
  });
  $('customAdd').addEventListener('click', () => {
    const kind = $('customAddType').value;
    checkpoint();
    if (state.elements[kind]) {
      selected = kind;
      patch({ enabled: true });
      if (kind === 'music' && !$('nowPlayingEnabled').checked) {
        $('nowPlayingEnabled').checked = true;
        $('nowPlayingEnabled').dispatchEvent(new Event('change'));
      }
    } else {
      if (state.extras.length >= 12) {
        say('最多添加 12 个文字或图片元素。');
        return;
      }
      const id = 'item-' + Date.now().toString(36);
      selected = id;
      update({
        ...state,
        extras: [
          ...state.extras,
          {
            id,
            type: kind,
            name: kind === 'image' ? '图片' : '文字',
            x: 120,
            y: 150,
            w: kind === 'image' ? 240 : 520,
            h: kind === 'image' ? 240 : 90,
            text: '新的通讯',
            size: 36,
            weight: 700,
            color: '#f1f0e9',
          },
        ],
      });
    }
    editing = true;
    $('customEdit').checked = true;
    handlesUI();
  });
  function undo(redo = false) {
    const from = redo ? future : history,
      to = redo ? history : future;
    if (!from.length) return;
    to.push(JSON.stringify(state));
    update(JSON.parse(from.pop()));
    syncUndo();
  }
  $('customUndo').addEventListener('click', () => undo());
  $('customRedo').addEventListener('click', () => undo(true));
  $('customReset').addEventListener('click', () => {
    checkpoint();
    update({});
  });
  handles.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-element]');
    if (!el || e.button !== 0) return;
    e.preventDefault();
    selected = el.dataset.element;
    syncFields();
    checkpoint();
    const r = lookup(selected);
    drag = {
      id: selected,
      startX: e.clientX,
      startY: e.clientY,
      rect: { ...r },
      resize: !!e.target.dataset.resize,
      scale: scene.getBoundingClientRect().width / 1920,
    };
    handles.setPointerCapture(e.pointerId);
  });
  handles.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / drag.scale,
      dy = (e.clientY - drag.startY) / drag.scale,
      r = drag.rect,
      snap = (v) => (e.shiftKey ? Math.round(v / 10) * 10 : v);
    patch(
      drag.resize
        ? { w: snap(r.w + dx), h: snap(r.h + dy) }
        : { x: snap(r.x + dx), y: snap(r.y + dy) },
      false,
    );
  });
  function finishDrag() {
    if (!drag) return;
    drag = null;
    persist();
  }
  handles.addEventListener('pointerup', finishDrag);
  handles.addEventListener('pointercancel', finishDrag);
  handles.addEventListener('lostpointercapture', finishDrag);
  handles.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    checkpoint();
    const r = lookup(selected),
      n = e.shiftKey ? 10 : 1;
    patch({
      x: r.x + (e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0),
      y: r.y + (e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0),
    });
  });
  handles.tabIndex = 0;
  handles.setAttribute('aria-label', '布局画布：方向键微调选中元素');
  $('customImageFile').addEventListener('change', async (e) => {
    const file = e.target.files[0],
      id = selected;
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 8 * 1024 * 1024) {
      say('请选择小于 8 MB 的 PNG、JPEG、WebP 或 GIF 图片。');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file),
        scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height)),
        surface = document.createElement('canvas');
      surface.width = Math.round(bitmap.width * scale);
      surface.height = Math.round(bitmap.height * scale);
      surface.getContext('2d').drawImage(bitmap, 0, 0, surface.width, surface.height);
      bitmap.close();
      const src = surface.toDataURL('image/webp', 0.85);
      if (src.length > 600000) throw Error('size');
      if (selected !== id || lookup(id)?.type !== 'image') return;
      checkpoint();
      patch({ src, h: Math.min(1080, (lookup(id).w * surface.height) / surface.width) });
    } catch {
      say('图片读取失败或过大，请换一张较小的图片。');
    }
  });
  function download(name, text) {
    const a = document.createElement('a'),
      url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  $('customExport').addEventListener('click', () =>
    download('控制主题-自定义布局.json', JSON.stringify(state, null, 2)),
  );
  $('customImport').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 8000000) throw Error();
      const value = JSON.parse(await file.text());
      if (value.version !== 1 || !value.elements) throw Error();
      checkpoint();
      update(value);
    } catch {
      say('无法读取该布局，请导入由本页导出的 JSON 文件。');
    }
  });
  $('nowPlayingEnabled').addEventListener('change', (e) => {
    if (scene.dataset.layout === 'custom') {
      checkpoint();
      selected = 'music';
      patch({ enabled: e.target.checked });
    }
  });
  window.addEventListener('live-layout-change', () => {
    apply();
    syncFields();
  });
  window.addEventListener('storage', (e) => {
    if (!obs && e.key === key) {
      try {
        update(JSON.parse(e.newValue) || {}, { save: false });
      } catch {}
    }
  });
  window.CustomLayout = {
    setValue(value) {
      update(value, { save: false });
    },
    get value() {
      return structuredClone(state);
    },
    get zones() {
      return window.ThemeRenderer?.value
        ? ThemeEditorModel.custom(window.ThemeRenderer.value)
        : { elements: state.elements };
    },
    apply,
    exportHash: () => new URLSearchParams({ custom: JSON.stringify(state) }).toString(),
  };
  syncFields();
  syncUndo();
  apply();
})();
