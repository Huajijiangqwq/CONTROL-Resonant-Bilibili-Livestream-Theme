/* Crop controls edit source coordinates, never resize the authored layer. */
(() => {
  'use strict';
  const instances = new Set();
  let activeGesture = null;
  function prune() {
    for (const instance of instances)
      if (!instance.section.isConnected) { instance.dispose(); instances.delete(instance); }
  }
  function mount(root, api) {
    const layer = api.get();
    if (!ThemeMediaCrop.enabled(layer)) return;
    const section = document.createElement('section'); section.className = 'property-section crop-section';
    const title = document.createElement('h3'); title.textContent = '裁剪';
    const body = document.createElement('div'); body.className = 'fields';
    const preview = document.createElement('div'); preview.className = 'source-crop-preview full';
    const media = document.createElement(layer.type === 'video' || layer.mode === 'video' ? 'video' : 'img');
    media.alt = '原始素材与裁剪范围'; media.muted = true; media.preload = 'metadata';
    const outline = document.createElement('div'); outline.className = 'source-crop-outline';
    outline.setAttribute('aria-label', '拖动裁剪范围；使用下方输入框精确调整');
    for (const side of ['tl', 'tr', 'bl', 'br']) {
      const handle = document.createElement('span'); handle.className = 'crop-handle ' + side;
      handle.dataset.corner = side; outline.append(handle);
    }
    preview.append(media, outline); body.append(preview);
    const inputs = new Map(); let drag = null, mediaBox = null;
    const crop = () => ThemeMediaCrop.normalize(api.get() || {});
    const write = value => { api.change(l => Object.assign(l, value)); refresh(); };
    for (const [side, label] of [['Left', '左侧 %'], ['Right', '右侧 %'], ['Top', '顶部 %'], ['Bottom', '底部 %']]) {
      const field = document.createElement('label'); field.textContent = label;
      const input = document.createElement('input'); input.type = 'number'; input.min = 0; input.max = 95; input.step = .5;
      input.setAttribute('aria-label', '裁剪' + label); inputs.set('crop' + side, input);
      let begun = false;
      input.onfocus = () => { begun = false; };
      input.oninput = () => {
        if (!input.value.trim() || !Number.isFinite(Number(input.value))) return;
        if (!begun) { api.begin(); begun = true; }
        const value = crop(), opposite = { Left: 'Right', Right: 'Left', Top: 'Bottom', Bottom: 'Top' }[side];
        value['crop' + side] = Math.max(0, Math.min(95 - value['crop' + opposite], Number(input.value)));
        write(value);
      };
      input.onchange = () => { begun = false; api.end({ fields: false }); refresh(true); };
      field.append(input); body.append(field);
    }
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'wide full'; reset.textContent = '恢复完整素材';
    reset.onclick = () => { api.begin(); write(ThemeMediaCrop.normalize()); api.end({ fields: false }); };
    const note = document.createElement('p'); note.className = 'property-note full';
    note.textContent = '拖动角点裁剪，拖动选区调整取景。保留原始素材与图层尺寸，填充方式决定裁剪后的显示比例。';
    body.append(reset, note); section.append(title, body); root.append(section);
    function refresh(force = false) {
      const l = api.get(); if (!l) return;
      if (media.getAttribute('src') !== l.src) media.src = l.src || '';
      const value = crop();
      for (const [key, input] of inputs) {
        input.disabled = l.locked;
        if (force || document.activeElement !== input) input.value = +value[key].toFixed(2);
      }
      reset.disabled = l.locked; outline.classList.toggle('locked', !!l.locked);
      const width = media.naturalWidth || media.videoWidth, height = media.naturalHeight || media.videoHeight,
        area = preview.getBoundingClientRect();
      if (!width || !height || !area.width || !area.height) { outline.hidden = true; return; }
      outline.hidden = false;
      const factor = Math.min(area.width / width, area.height / height);
      mediaBox = { x: (area.width - width * factor) / 2, y: (area.height - height * factor) / 2,
        w: width * factor, h: height * factor };
      Object.assign(outline.style, { left: mediaBox.x + mediaBox.w * value.cropLeft / 100 + 'px',
        top: mediaBox.y + mediaBox.h * value.cropTop / 100 + 'px',
        width: mediaBox.w * (1 - (value.cropLeft + value.cropRight) / 100) + 'px',
        height: mediaBox.h * (1 - (value.cropTop + value.cropBottom) / 100) + 'px' });
    }
    outline.onpointerdown = event => {
      if (event.button || api.get()?.locked || !mediaBox) return;
      event.preventDefault(); event.stopPropagation(); api.begin();
      drag = { x: event.clientX, y: event.clientY, crop: crop(), box: { ...mediaBox }, corner: event.target.dataset.corner || '' };
      activeGesture = {
        cancel() { const value = drag?.crop; drag = null; activeGesture = null; if (value) write(value); api.end({ fields: false }); },
        finish() { drag = null; activeGesture = null; api.end({ fields: false }); },
      };
      outline.setPointerCapture(event.pointerId);
    };
    outline.onpointermove = event => {
      if (!drag) return;
      const value = { ...drag.crop }, dx = (event.clientX - drag.x) / drag.box.w * 100,
        dy = (event.clientY - drag.y) / drag.box.h * 100, limit = (n, max) => Math.max(0, Math.min(max, n));
      if (!drag.corner) {
        const x = Math.max(-value.cropLeft, Math.min(value.cropRight, dx)), y = Math.max(-value.cropTop, Math.min(value.cropBottom, dy));
        value.cropLeft += x; value.cropRight -= x; value.cropTop += y; value.cropBottom -= y;
      } else {
        if (drag.corner.includes('l')) value.cropLeft = limit(value.cropLeft + dx, 95 - value.cropRight);
        if (drag.corner.includes('r')) value.cropRight = limit(value.cropRight - dx, 95 - value.cropLeft);
        if (drag.corner.includes('t')) value.cropTop = limit(value.cropTop + dy, 95 - value.cropBottom);
        if (drag.corner.includes('b')) value.cropBottom = limit(value.cropBottom - dy, 95 - value.cropTop);
      }
      write(value);
    };
    outline.onpointerup = outline.onlostpointercapture = () => { if (drag) { drag = null; activeGesture = null; api.end({ fields: false }); } };
    outline.onpointercancel = () => { if (drag) activeGesture?.cancel(); };
    media.onload = media.onloadeddata = refresh;
    const observer = new ResizeObserver(() => refresh()); observer.observe(preview);
    instances.add({ section, refresh, dispose() {
      observer.disconnect(); media.onload = media.onloadeddata = null;
      if (drag) { drag = null; activeGesture = null; }
      media.removeAttribute('src'); if (media.tagName === 'VIDEO') media.load();
    } });
    refresh();
  }
  window.addEventListener('theme-document-change', () => {
    prune(); for (const instance of instances) instance.refresh();
  });
  window.addEventListener('keydown', event => {
    if (!activeGesture) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); activeGesture.cancel(); }
    else if (['Delete', 'Backspace'].includes(event.key) || (event.ctrlKey || event.metaKey) && ['z', 'd', 'g'].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.stopPropagation();
    }
  }, true);
  window.addEventListener('blur', () => activeGesture?.finish());
  window.ThemeMediaCropUI = { mount, prune, get isInteracting() { return !!activeGesture; } };
})();
