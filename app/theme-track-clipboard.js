/* Reuse numeric animation tracks across parts and editor views. */
(() => {
  'use strict';
  const K = ThemeKeyframes,
    key =
      'control-animation-clipboard-v1' +
      (new URLSearchParams(location.search).has('qa') ? '-qa' : ''),
    listeners = new Map();
  function read(properties) {
    try {
      const value = localStorage.getItem(key);
      if (!value || value.length > 256000) return [];
      const raw = JSON.parse(value);
      if (raw?.format !== 'control-animation' || raw.version !== 1) return [];
      return K.normalize(raw.tracks, properties);
    } catch {
      return [];
    }
  }
  function notify() {
    for (const [element, refresh] of listeners) {
      if (!element.isConnected) listeners.delete(element);
      else refresh();
    }
  }
  function write(tracks) {
    const value = { format: 'control-animation', version: 1, tracks };
    try {
      localStorage.setItem(key, JSON.stringify(value));
      notify();
      return true;
    } catch {
      return false;
    }
  }
  function mount(parent, { owner, properties, change }) {
    const row = document.createElement('div');
    row.className = 'track-clipboard';
    const copy = document.createElement('button'),
      paste = document.createElement('button'),
      status = document.createElement('span');
    status.setAttribute('role', 'status');
    copy.textContent = '复制关键帧';
    copy.disabled = !owner().tracks?.length;
    copy.title = '复制当前阶段的全部属性轨道';
    paste.textContent = '粘贴关键帧';
    paste.title = '保留数值和曲线，覆盖同名轨道；其他轨道和循环设置不变';
    const refresh = () => {
      paste.disabled = !read(properties).length;
    };
    copy.onclick = () => {
      const tracks = K.normalize(owner().tracks, properties);
      status.textContent = write(tracks)
        ? '已复制 ' + tracks.length + ' 条轨道'
        : '无法写入临时剪贴板';
    };
    paste.onclick = () => {
      const tracks = read(properties);
      if (!tracks.length) return;
      change((target) => {
        const replacements = new Map(tracks.map((t) => [t.property, t]));
        target.tracks = (target.tracks || []).map((t) => {
          const next = replacements.get(t.property);
          if (next) replacements.delete(t.property);
          return next || t;
        });
        target.tracks.push(...replacements.values());
      });
    };
    row.append(copy, paste, status);
    parent.append(row);
    listeners.set(row, refresh);
    refresh();
  }
  window.addEventListener('storage', (e) => {
    if (e.key === key) notify();
  });
  window.addEventListener('focus', notify);
  window.ThemeTrackClipboard = { mount };
})();
