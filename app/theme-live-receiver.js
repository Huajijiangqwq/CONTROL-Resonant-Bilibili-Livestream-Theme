/* Live documents update native renderers in place. No navigation, refresh or replay. */
(() => {
  'use strict';
  const id = new URLSearchParams(location.search).get('live');
  if (!/^[a-f0-9]{24}$/.test(id || '')) return;
  let packet = null,
    revision = -1,
    lastFrame = 0,
    raf = 0,
    source = null,
    stopped = false;
  const scene = document.getElementById('scene');
  function draw(now) {
    raf = 0;
    if (stopped || !packet) return;
    if (!window.ThemeRenderer?.active) {
      raf = requestAnimationFrame(draw);
      return;
    }
    if (now - lastFrame < 31 && Date.now() < packet.startAt + packet.duration) {
      raf = requestAnimationFrame(draw);
      return;
    }
    lastFrame = now;
    try {
      window.ThemeRenderer.apply(ThemeSyncMotion.at(packet));
      if (scene) {
        scene.dataset.syncRevision = String(revision);
        scene.dataset.syncState = 'live';
      }
    } catch (e) {
      if (scene) scene.dataset.syncState = 'error';
      return;
    }
    if (Date.now() < packet.startAt + packet.duration) raf = requestAnimationFrame(draw);
  }
  function receive(value) {
    if (value.revision < revision) return;
    if (value.revision === revision && packet) return;
    revision = value.revision;
    packet = { duration: 0, startAt: 0, ...value };
    if (!raf) raf = requestAnimationFrame(draw);
  }
  source = new EventSource('/api/obs/live/' + id + '/events');
  source.addEventListener('layout', (event) => {
    try {
      receive(JSON.parse(event.data));
    } catch {
      if (scene) scene.dataset.syncState = 'error';
    }
  });
  source.addEventListener('error', () => {
    if (scene) scene.dataset.syncState = 'reconnecting';
  });
  window.addEventListener(
    'pagehide',
    () => {
      stopped = true;
      source.close();
      cancelAnimationFrame(raf);
    },
    { once: true },
  );
})();
