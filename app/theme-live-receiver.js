/* Live documents update native renderers in place. No navigation, refresh or replay. */
(() => {
  'use strict';
  const id = new URLSearchParams(location.search).get('live');
  if (!/^[a-f0-9]{24}$/.test(id || '')) return;
  let packet = null,
    revision = -1,
    raf = 0,
    source = null,
    stopped = false;
  const gate = window.FrameRate?.gate(), fps = Number(new URLSearchParams(location.search).get('fps'));
  if (gate && Number.isInteger(fps) && fps >= 1 && fps <= 240) gate.getLimit = () => fps;
  const scene = document.getElementById('scene');
  function draw(now) {
    raf = 0;
    if (stopped || !packet) return;
    if (!window.ThemeRenderer?.active) {
      raf = requestAnimationFrame(draw);
      return;
    }
    // The geometry and fluid animation follow the same configured frame cap.
    // Always commit the endpoint even when it falls between gated frames.
    if (gate && !gate.due(now) && Date.now() < packet.startAt + packet.duration) {
      raf = requestAnimationFrame(draw);
      return;
    }
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
