/* SharedWorker transport with a one-stream-per-page fallback for older OBS. */
(() => {
  'use strict';
  if (window.StudioEvents) return;
  try { if (parent !== window && parent.location.origin === location.origin && parent.StudioEvents) { window.StudioEvents = parent.StudioEvents; return; } } catch {}
  const listeners = new Set(), snapshots = new Map();
  let worker = null, source = null, previews = [], disposed = false, fallbackTimer = 0;
  function broadcast(type, value) { for (const listener of listeners) listener(type, value); }
  function receive(value) {
    if (value.event === 'preview') {
      if (value.data.command !== 'editor-send') previews = previews.filter(item => item.path !== value.path);
      previews = previews.filter(item => Date.now() - item.data.at < 30000).slice(-199); previews.push(value);
    } else {
      if (value.event === 'source') {
        const previous = snapshots.get(value.path + ':source');
        if (previous && (previous.data.source !== value.data.source || previous.data.epoch !== value.data.epoch)) previews = previews.filter(item => item.path !== value.path);
      }
      snapshots.set(value.path + ':' + value.event, value);
    }
    broadcast('packet', value);
  }
  function fallback() {
    clearTimeout(fallbackTimer);
    if (source || disposed) return;
    if (worker) { worker.port.postMessage({ type: 'close' }); worker.port.close(); worker = null; }
    source = new EventSource('/api/studio-events');
    source.addEventListener('studio', event => { try { receive(JSON.parse(event.data)); } catch {} });
    source.addEventListener('error', () => broadcast('error'));
  }
  function connect() {
    if (worker || source || disposed) return;
    try {
      if (typeof SharedWorker !== 'function') { fallback(); return; }
      worker = new SharedWorker('studio-events-worker.js', { name: 'control-studio-events-v1' });
      worker.port.onmessage = event => {
        clearTimeout(fallbackTimer);
        if (event.data?.type === 'packet') receive(event.data.value);
        else if (event.data?.type === 'error') broadcast('error');
      };
      worker.onerror = fallback; worker.port.start();
      fallbackTimer = setTimeout(fallback, 2500);
    } catch { fallback(); }
  }
  function open(path) {
    const callbacks = new Map(); let closed = false;
    function dispatch(type, value) {
      if (closed || (type === 'packet' && value.path !== path)) return;
      const name = type === 'error' ? 'error' : value.event;
      for (const callback of callbacks.get(name) || []) {
        try { callback(type === 'error' ? {} : { data: JSON.stringify(value.data) }); }
        catch (error) { console.error('共享显示状态回调失败', error); }
      }
    }
    listeners.add(dispatch); connect();
    // Consumers attach their event listener synchronously after creating the source.
    queueMicrotask(() => {
      for (const value of snapshots.values()) dispatch('packet', value);
      for (const value of previews) if (Date.now() - value.data.at < 30000) dispatch('packet', value);
    });
    return {
      addEventListener(name, fn) { if (!callbacks.has(name)) callbacks.set(name, new Set()); callbacks.get(name).add(fn); },
      close() { closed = true; listeners.delete(dispatch); callbacks.clear(); },
    };
  }
  window.StudioEvents = { open };
  window.addEventListener('pagehide', () => {
    disposed = true; clearTimeout(fallbackTimer); listeners.clear(); source?.close();
    if (worker) { worker.port.postMessage({ type: 'close' }); worker.port.close(); }
  });
})();
