/* The same persistent checkpoint is rendered by live preview and OBS. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (!params.has('published')) return;
  const channel = params.get('published') === 'chat' ? 'chat' : 'theme';
  const scene = document.getElementById('scene');
  let last = '', stopped = false, waiting = null, frame = 0;
  const errorLabel = document.getElementById('previewStatus');
  scene.style.visibility = 'hidden';
  function report(state, packet) {
    scene.dataset.publishedState = state;
    if (packet) {
      scene.dataset.publishedRevision = String(packet.revision);
      scene.dataset.publishedName = packet.name || '';
    }
    window.dispatchEvent(new CustomEvent('theme-publication-state', { detail: { state, packet } }));
  }
  function draw() {
    frame = 0;
    if (stopped || !waiting) return;
    if (!window.ThemeRenderer || !window.ThemeLiveBridge?.ready) { frame = requestAnimationFrame(draw); return; }
    const value = waiting; waiting = null;
    if (!value.document) { report('empty', value); if (errorLabel) errorLabel.textContent = '尚未应用主题，请在编辑器中点击“应用到直播”。'; return; }
    const stamp = value.epoch + ':' + value.revision;
    if (stamp === last) { report('ready', value); return; }
    try {
      window.ThemeOutput?.setMode(value.output, value.chatId);
      window.ThemeRenderer.apply(value.document);
      last = stamp;
      scene.style.visibility = '';
      report('ready', value);
    } catch (error) {
      report('error', value);
      if (errorLabel) errorLabel.textContent = '直播主题更新失败：' + error.message;
    }
  }
  const path = '/api/theme-publish/' + channel + '/events';
  const stream = window.StudioEvents ? window.StudioEvents.open(path) : new EventSource(path);
  stream.addEventListener('published', event => {
    try { waiting = JSON.parse(event.data); if (!frame) frame = requestAnimationFrame(draw); }
    catch { report('error'); }
  });
  stream.addEventListener('error', () => report('reconnecting'));
  window.addEventListener('pagehide', () => { stopped = true; stream.close(); cancelAnimationFrame(frame); });
})();
