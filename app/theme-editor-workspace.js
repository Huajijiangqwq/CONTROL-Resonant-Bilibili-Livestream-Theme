/* Workspace proportions are local UI preferences, never broadcast geometry. */
(() => {
  'use strict';
  function install() {
    const scene = location.pathname.endsWith('chat-editor.html') ? 'chat' : 'scene',
      key =
        'control-editor-workspace-v1-' +
        scene +
        (new URLSearchParams(location.search).has('qa') ? '-qa' : '');
    const body = document.body,
      assets = document.querySelector('.assets-panel'),
      inspector = document.querySelector('.inspector'),
      rail = document.querySelector('.toolrail'),
      properties = document.querySelector('.properties'),
      divider = document.querySelector('.inspector-divider');
    let prefs = {};
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      for (const field of ['assets', 'inspector', 'vertical'])
        if (Number.isFinite(saved?.[field])) prefs[field] = saved[field];
    } catch {}
    const handles = {},
      clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    let drag = null;
    function defaults() {
      return innerWidth <= 1000
        ? { assets: 140, inspector: 220, canvas: 360 }
        : innerWidth <= 1250
          ? { assets: 172, inspector: 250, canvas: 360 }
          : { assets: 214, inspector: 286, canvas: 360 };
    }
    function limits(type) {
      const base = defaults(),
        hidden = body.classList.contains('assets-collapsed'),
        other =
          type === 'assets'
            ? inspector.getBoundingClientRect().width
            : hidden
              ? 0
              : assets.getBoundingClientRect().width,
        min = type === 'assets' ? 140 : 220;
      return {
        min,
        max: Math.max(
          min,
          Math.min(
            type === 'assets' ? 320 : 500,
            innerWidth - rail.getBoundingClientRect().width - other - base.canvas,
          ),
        ),
      };
    }
    function save() {
      try {
        localStorage.setItem(key, JSON.stringify(prefs));
      } catch {}
    }
    function apply() {
      const base = defaults();
      for (const [type, el] of [
        ['assets', assets],
        ['inspector', inspector],
      ]) {
        const { min, max } = limits(type),
          width = clamp(prefs[type] ?? base[type], min, max);
        body.style.setProperty('--' + type + '-width', width + 'px');
        if (handles[type]) {
          handles[type].setAttribute('aria-valuemin', min);
          handles[type].setAttribute('aria-valuemax', max);
          handles[type].setAttribute('aria-valuenow', Math.round(width));
        }
      }
      if (Number.isFinite(prefs.vertical))
        properties.style.height =
          clamp(prefs.vertical * inspector.clientHeight, 190, inspector.clientHeight - 130) + 'px';
    }
    function finish() {
      if (!drag) return;
      drag = null;
      body.classList.remove('resizing-panels');
      save();
    }
    for (const [type, el, name] of [
      ['assets', assets, '素材栏'],
      ['inspector', inspector, '属性栏'],
    ]) {
      const handle = document.createElement('div');
      handle.className = 'workspace-resizer ' + type;
      handle.tabIndex = 0;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-label', '调整' + name + '宽度');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.title = '拖动调整' + name + '宽度 · 双击恢复默认';
      handles[type] = handle;
      el.append(handle);
      handle.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        handle.focus();
        drag = { type, start: e.clientX, width: el.getBoundingClientRect().width };
        handle.setPointerCapture(e.pointerId);
        body.classList.add('resizing-panels');
      };
      handle.onpointermove = (e) => {
        if (drag?.type !== type) return;
        const { min, max } = limits(type);
        prefs[type] = clamp(
          drag.width + (e.clientX - drag.start) * (type === 'assets' ? 1 : -1),
          min,
          max,
        );
        apply();
      };
      handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = finish;
      handle.onkeydown = (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Home') delete prefs[type];
        else {
          const { min, max } = limits(type),
            direction = (e.key === 'ArrowRight' ? 1 : -1) * (type === 'assets' ? 1 : -1);
          prefs[type] = clamp(
            el.getBoundingClientRect().width + direction * (e.shiftKey ? 40 : 10),
            min,
            max,
          );
        }
        apply();
        save();
      };
      handle.ondblclick = () => {
        delete prefs[type];
        apply();
        save();
      };
    }
    if (divider) {
      const storeVertical = () => {
        prefs.vertical =
          properties.getBoundingClientRect().height / inspector.getBoundingClientRect().height;
        save();
      };
      divider.addEventListener('pointerup', storeVertical);
      divider.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown'].includes(e.key)) storeVertical();
      });
      divider.addEventListener('dblclick', () => {
        delete prefs.vertical;
        properties.style.height = '57%';
        save();
      });
    }
    window.addEventListener('resize', apply);
    window.addEventListener('blur', finish);
    new MutationObserver(apply).observe(body, { attributes: true, attributeFilter: ['class'] });
    apply();
  }
  window.ThemeEditorWorkspace = { install };
})();
