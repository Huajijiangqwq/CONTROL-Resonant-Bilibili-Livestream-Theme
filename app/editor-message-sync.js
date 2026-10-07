(() => {
  'use strict';
  const p = new URLSearchParams(location.search), editorMode = p.has('editor'), writerMode = editorMode || (!p.has('obs') && !p.has('pure'));
  if (p.has('libraryPreview')) return;
  let channel = p.get('chatSync');
  if (!channel && editorMode) {
    try { channel = parent.location.pathname.endsWith('chat-editor.html') ? 'chat' : 'theme'; } catch {}
  }
  // Older exported editor URLs lacked a route; keep those sources usable after refresh.
  if (!channel && p.has('published')) channel = p.get('published') === 'chat' ? 'chat' : 'theme';
  if (!channel && (p.has('theme') || p.has('live') || new URLSearchParams(location.hash.slice(1)).has('theme'))) channel = p.get('output') === 'chat' ? 'chat' : 'theme';
  if (!channel) channel = 'theme';
  if (!['theme', 'chat'].includes(channel)) return;
  const writer = crypto.randomUUID(), base = '/api/editor-messages/' + channel;
  let applying = false, stopped = false, chain = Promise.resolve(), stream, pending = [], frame = 0, seenEpoch = '', seenSequence = 0, previewMirroring = false;
  let sourceEpoch = '', sourceRevision = -1, connected = false;
  let sourceIntent = 0, mirroringGeneration = 0;
  function status(value) {
    if (stopped) return;
    if (typeof value.connected === 'boolean') connected = value.connected;
    value = { connected, ...value, mirroring: previewMirroring };
    window.dispatchEvent(new CustomEvent('editor-message-status', { detail: value }));
    if (editorMode) parent.postMessage({ channel: 'editor-message-status', ...value }, location.origin);
  }
  async function request(command, data) {
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, command, id: crypto.randomUUID(), writer }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error('消息同步未送达（' + response.status + '）');
    return response.json();
  }
  function publish(command, data) {
    if (!writerMode || applying || stopped) return Promise.resolve(false);
    if (command !== 'source' && !previewMirroring) return Promise.resolve(false);
    if (command === 'source') mirroringGeneration++;
    const intent = command === 'source' ? ++sourceIntent : sourceIntent, generation = mirroringGeneration;
    const job = chain.catch(() => {}).then(() => {
      if (stopped || (command === 'source' ? intent !== sourceIntent : !previewMirroring || generation !== mirroringGeneration)) return null;
      return request(command, data);
    });
    chain = job;
    return job.then(value => { if (!value) return false; status({ connected: true }); return true; }, () => { status({ connected: false, error: 'OBS 弹幕同步未送达，请检查本地服务。' }); return false; });
  }
  function source(value) {
    if (value.epoch === sourceEpoch && Number(value.revision) < sourceRevision) return;
    sourceEpoch = value.epoch; sourceRevision = Number(value.revision) || 0;
    if (!['live', 'simulation'].includes(value.source)) return;
    if (window.ThemeLiveBridge.messageSource !== value.source) { pending = []; mirroringGeneration++; }
    applying = true;
    try { window.ThemeLiveBridge.setMessageSource(value.source); } finally { applying = false; }
  }
  function flush() {
    frame = 0;
    if (stopped) return;
    if (!window.ThemeLiveBridge?.ready || (p.has('published') && !window.ThemeRenderer?.active)) {
      if (pending.length) frame = requestAnimationFrame(flush);
      return;
    }
    for (const item of pending.splice(0)) {
      if (Date.now() - item.at > 30000) continue;
      if (window.ThemeRenderer?.active) window.ThemeRenderer.remotePreview(item.command, item.data);
      else window.ThemeLiveBridge.remotePreview(item.command, item.data);
    }
  }
  function preview(value) {
    if (value.epoch !== seenEpoch) { seenEpoch = value.epoch; seenSequence = 0; }
    if (value.sequence <= seenSequence) return;
    seenSequence = value.sequence;
    if (value.writer === writer) return;
    pending.push(value); if (pending.length > 100) pending.shift();
    if (!frame) frame = requestAnimationFrame(flush);
  }
  window.EditorMessageSync = {
    channel, publish: (command, data) => publish(command, { data }),
    get mirroring() { return previewMirroring; },
    setMirroring(value) { if (previewMirroring !== !!value) mirroringGeneration++; previewMirroring = !!value; status({}); },
  };
  window.addEventListener('live-message-source', event => {
    if (!applying) publish('source', { source: event.detail });
  });
  stream = window.StudioEvents ? window.StudioEvents.open(base + '/events') : new EventSource(base + '/events');
  stream.addEventListener('source', event => {
    try {
      const value = JSON.parse(event.data);
      if (value.source === null && writerMode)
        publish('source', { source: window.ThemeLiveBridge.messageSource, initialize: true });
      else source(value);
      status({ connected: true });
    } catch {}
  });
  stream.addEventListener('preview', event => { try { preview(JSON.parse(event.data)); } catch {} });
  stream.addEventListener('error', () => status({ connected: false }));
  window.addEventListener('pagehide', () => { stopped = true; stream.close(); cancelAnimationFrame(frame); pending = []; });
})();
