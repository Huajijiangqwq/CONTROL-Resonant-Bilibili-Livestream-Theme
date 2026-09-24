(function (root) {
  'use strict';
  const key = 'hiss-animation-frame-rate-v1';
  const privateSetting =
    !!root.document &&
    (() => {
      const p = new URLSearchParams(root.location.search);
      return (
        p.has('editor') ||
        p.has('theme') ||
        new URLSearchParams(root.location.hash.slice(1)).has('theme')
      );
    })();
  function valid(value) {
    return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 240;
  }
  let setting = { mode: '60', custom: 60 },
    revision = 0;
  function read() {
    try {
      const saved = JSON.parse(root.localStorage.getItem(key) || 'null');
      if (saved && ['60', '30', 'custom'].includes(saved.mode) && valid(saved.custom))
        setting = { mode: saved.mode, custom: Number(saved.custom) };
    } catch {}
  }
  const fps = () => (setting.mode === 'custom' ? setting.custom : Number(setting.mode));
  class FrameGate {
    constructor(getLimit = fps) {
      this.getLimit = getLimit;
      this.next = NaN;
      this.limit = 0;
      this.revision = -1;
    }
    due(now) {
      const limit = this.getLimit(),
        interval = 1000 / limit;
      if (limit !== this.limit || this.revision !== revision || !Number.isFinite(this.next)) {
        this.limit = limit;
        this.revision = revision;
        this.next = now;
      }
      // Retain the fractional deadline instead of rounding to 16/33 ms or discarding the remainder.
      if (now + 0.1 < this.next) return false;
      this.next += Math.max(1, Math.floor((now - this.next + 0.1) / interval) + 1) * interval;
      return true;
    }
    reset() {
      this.next = NaN;
    }
  }
  function mount(container) {
    if (!container) return;
    container.style.cssText = 'margin:14px 0 16px;font-size:12px;line-height:1.65;';
    const label = document.createElement('label'),
      caption = document.createElement('span'),
      select = document.createElement('select');
    label.style.cssText = 'display:block;margin:0';
    caption.textContent = '动画帧率上限';
    caption.style.cssText = 'display:block;margin-bottom:7px;color:#bac7bd;';
    for (const [value, name] of [
      ['60', '60 FPS'],
      ['30', '30 FPS'],
      ['custom', '自定义'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = name;
      select.append(option);
    }
    select.id = 'animationFps';
    label.append(caption, select);
    const customLabel = document.createElement('label'),
      customName = document.createElement('span'),
      input = document.createElement('input');
    customLabel.style.cssText = 'display:block;margin:10px 0 0';
    customName.textContent = '自定义上限（FPS）';
    customName.style.cssText = 'display:block;margin-bottom:7px;color:#bac7bd;';
    input.id = 'animationFpsCustom';
    input.type = 'number';
    input.min = '1';
    input.max = '240';
    input.step = '1';
    input.inputMode = 'numeric';
    customLabel.append(customName, input);
    const hint = document.createElement('p');
    hint.style.cssText = 'margin:8px 0 0;font-size:11px;line-height:1.8;color:#8e9f94;';
    hint.setAttribute('role', 'status');
    const sync = () => {
      select.value = setting.mode;
      input.value = setting.custom;
      customLabel.hidden = setting.mode !== 'custom';
      customLabel.style.display = customLabel.hidden ? 'none' : 'block';
      hint.textContent = fps() + ' FPS 上限 · 动画时长不变。实际帧率受屏幕刷新率与性能限制。';
      input.removeAttribute('aria-invalid');
    };
    const save = () => {
      revision++;
      if (!privateSetting)
        try {
          root.localStorage.setItem(key, JSON.stringify(setting));
        } catch {}
      sync();
      root.dispatchEvent(new Event('hiss-frame-rate'));
    };
    select.addEventListener('change', () => {
      setting.mode = select.value;
      save();
    });
    input.addEventListener('input', () => {
      if (!input.value.trim() || !valid(input.value)) {
        input.setAttribute('aria-invalid', 'true');
        hint.textContent = '请输入 1–240 的整数，当前仍为 ' + fps() + ' FPS 上限。';
        return;
      }
      setting.custom = Number(input.value);
      save();
    });
    root.addEventListener('storage', (event) => {
      if (!privateSetting && event.key === key) {
        read();
        revision++;
        sync();
      }
    });
    container.append(label, customLabel, hint);
    sync();
  }
  if (typeof module === 'object' && module.exports) module.exports = { FrameGate, valid };
  if (root.document) {
    read();
    root.FrameRate = {
      gate: () => new FrameGate(),
      get fps() {
        return fps();
      },
    };
    mount(document.querySelector('[data-frame-rate]'));
  }
})(typeof window === 'object' ? window : globalThis);
