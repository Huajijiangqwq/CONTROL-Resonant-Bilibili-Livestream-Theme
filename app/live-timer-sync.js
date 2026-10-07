(function (root) {
  'use strict';
  function create({ seed, writer, apply, status, fetcher = root.fetch.bind(root), Events = root.EventSource }) {
    let latest = null, source = null, stopped = false, ready = false, busy = false, retry;
    const updateStatus = () => status({ ready, busy });
    function receive(value) {
      if (latest && latest.instance === value.instance && latest.revision > value.revision) return;
      latest = value; ready = true;
      apply({ elapsedMs: value.elapsedMs, startedAt: value.startedAt }); updateStatus();
    }
    async function request(body) {
      const response = await fetcher('/api/live-timer', body ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      } : { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '计时服务暂不可用');
      return data;
    }
    async function connect() {
      clearTimeout(retry);
      try {
        let value = await request();
        if (writer && !value.initialized)
          value = await request({ action: 'init', id: root.crypto.randomUUID(), seed: seed() });
        if (stopped) return;
        receive(value);
        source?.close(); source = root.StudioEvents ? root.StudioEvents.open('/api/live-timer/events') : new Events('/api/live-timer/events');
        source.addEventListener('timer', event => {
          try { if (!stopped) receive(JSON.parse(event.data)); } catch {}
        });
        source.addEventListener('error', () => { ready = false; updateStatus(); });
      } catch {
        if (stopped) return;
        ready = false; updateStatus(); retry = setTimeout(connect, 2000);
      }
    }
    async function command(action, extra = {}) {
      if (!ready || busy || stopped) return false;
      busy = true; updateStatus();
      try { receive(await request({ ...extra, action, id: root.crypto.randomUUID() })); return true; }
      catch { ready = false; source?.close(); retry = setTimeout(connect, 500); return false; }
      finally { busy = false; updateStatus(); }
    }
    updateStatus(); connect();
    return { command, get value() { return latest; }, close() { stopped = true; clearTimeout(retry); source?.close(); } };
  }
  if (typeof module === 'object' && module.exports) module.exports = { create };
  else root.LiveTimerSync = { create };
})(typeof window === 'object' ? window : globalThis);
