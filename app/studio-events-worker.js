'use strict';
// Shared by tabs and same-origin frames. Only public runtime display state flows here.
const ports = new Set(), snapshots = new Map();
let source = null, previews = [], reconnecting = false;
function accept(value) {
  if (value.event === 'preview') {
    if (value.data.command !== 'editor-send') previews = previews.filter(item => item.path !== value.path);
    const key = value.path + ':' + value.data.epoch + ':' + value.data.sequence;
    previews = previews.filter(item => Date.now() - item.data.at < 30000 && item.path + ':' + item.data.epoch + ':' + item.data.sequence !== key).slice(-199);
    previews.push(value);
  } else {
    const previous = snapshots.get(value.path + ':' + value.event);
    snapshots.set(value.path + ':' + value.event, value);
    if (value.event === 'source' && previous && (previous.data.source !== value.data.source || previous.data.epoch !== value.data.epoch)) previews = previews.filter(item => item.path !== value.path);
  }
  for (const port of ports) {
    try { port.postMessage({ type: 'packet', value }); }
    catch { ports.delete(port); }
  }
}
function connect() {
  if (source) return;
  source = new EventSource('/api/studio-events');
  source.addEventListener('studio', event => { try { reconnecting = false; accept(JSON.parse(event.data)); } catch {} });
  source.addEventListener('error', () => { reconnecting = true; for (const port of ports) port.postMessage({ type: 'error' }); });
}
self.onconnect = event => {
  const port = event.ports[0]; ports.add(port); port.start();
  port.postMessage({ type: 'ready' });
  for (const value of snapshots.values()) port.postMessage({ type: 'packet', value });
  for (const value of previews) if (Date.now() - value.data.at < 30000) port.postMessage({ type: 'packet', value });
  if (reconnecting) port.postMessage({ type: 'error' });
  port.onmessage = event => {
    if (event.data?.type !== 'close') return;
    ports.delete(port); port.close();
    if (!ports.size) { source?.close(); source = null; previews = []; snapshots.clear(); }
  };
  connect();
};
