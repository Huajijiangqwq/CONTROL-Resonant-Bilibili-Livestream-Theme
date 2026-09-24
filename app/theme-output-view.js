/* A viewport over the same native theme. Authored scene data stays intact. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports,
    M = node ? require('./theme-editor-model.js') : null;
  function crop(doc) {
    const chat = doc.layers?.find((l) => l.type === 'chat');
    return chat ? { x: chat.x, y: chat.y, w: Math.ceil(chat.w), h: Math.ceil(chat.h) } : null;
  }
  function prepare(value, mode, chatId) {
    const model = M || root.ThemeEditorModel,
      doc = model.normalize(value);
    if (mode !== 'chat') return doc;
    if (!crop(doc)) throw Error('主题中没有组合弹幕区。');
    const I = node ? require('./theme-instances.js') : root.ThemeInstances;
    if (I) {
      const target =
        doc.layers.find((l) => l.type === 'chat' && l.id === chatId) ||
        doc.layers.find((l) => l.type === 'chat');
      return model.normalize(I.project(doc, target.id));
    }
    const keep = doc.layers.filter(
        (l) =>
          l.type === 'chat' ||
          ['normal', 'sc', 'gift', 'fleet'].includes(l.type) ||
          l.scope === 'chat' ||
          l.attach === 'chat',
      ),
      parents = new Set(keep.map((l) => l.parent));
    const ids = new Set(keep.map((l) => l.id));
    for (const l of doc.layers) if (l.type === 'group' && parents.has(l.id)) ids.add(l.id);
    return model.normalize({
      ...doc,
      composition: 'feed',
      layers: doc.layers.filter((l) => ids.has(l.id)),
    });
  }
  const api = { crop, prepare };
  if (node) {
    module.exports = api;
    return;
  }
  const mode = new URLSearchParams(location.search).get('output') === 'chat' ? 'chat' : 'scene';
  let rect = null;
  api.mode = mode;
  api.apply = (value) => {
    const doc = prepare(value, mode, new URLSearchParams(location.search).get('chat'));
    rect = mode === 'chat' ? crop(doc) : null;
    return doc;
  };
  api.fit = () => {
    if (!rect) return false;
    const monitor = document.querySelector('.monitor'),
      viewport = document.getElementById('sceneViewport'),
      scene = document.getElementById('scene');
    if (!monitor || !viewport || !scene) return false;
    const scale = new URLSearchParams(location.search).has('live')
      ? 1
      : Math.max(0.001, Math.min(monitor.clientWidth / rect.w, monitor.clientHeight / rect.h));
    Object.assign(viewport.style, {
      width: rect.w * scale + 'px',
      height: rect.h * scale + 'px',
      aspectRatio: rect.w + ' / ' + rect.h,
    });
    scene.style.transform = `scale(${scale}) translate(${-rect.x}px,${-rect.y}px)`;
    document.documentElement.dataset.outputWidth = rect.w;
    document.documentElement.dataset.outputHeight = rect.h;
    return true;
  };
  root.ThemeOutput = api;
  if (mode === 'chat') {
    document.documentElement.classList.add('chat-output', 'pure');
    if (new URLSearchParams(location.search).has('live'))
      document.documentElement.classList.add('live-theme-output');
    const style = document.createElement('style');
    style.textContent =
      '.chat-output,.chat-output body{background:transparent!important}.chat-output.live-theme-output .monitor{display:block;padding:0}.chat-output.live-theme-output #sceneViewport{margin:0}.chat-output #scene{visibility:hidden}.chat-output #scene[data-theme-ready=true]{visibility:visible}.chat-output #sceneViewport{flex:none}.chat-output .game-window{display:none!important}';
    document.head.append(style);
    window.addEventListener('theme-applied', api.fit);
  }
})(globalThis);
