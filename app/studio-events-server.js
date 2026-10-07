'use strict';
// One event stream prevents HTTP/1.1 connection starvation in multi-tab editors.
function createStudioEvents({ timer, messages, published, obsPublished }) {
  const clients = new Set();
  const packet = (path, event, data) => ({ path, event, data });
  function send(res, value) { res.write('event: studio\ndata: ' + JSON.stringify(value) + '\n\n'); }
  function broadcast(value) {
    for (const res of clients) {
      if (res.destroyed || res.writableLength > 48 * 1024 * 1024) { res.end(); clients.delete(res); }
      else send(res, value);
    }
  }
  const unsubscribe = [
    timer.subscribe(value => broadcast(packet('/api/live-timer/events', 'timer', value))),
    messages.subscribe((channel, event, value) => broadcast(packet('/api/editor-messages/' + channel + '/events', event, value))),
    published.subscribe((channel, value) => broadcast(packet('/api/theme-publish/' + channel + '/events', 'published', value))),
  ];
  if (obsPublished) unsubscribe.push(obsPublished.subscribe(value => broadcast(packet('/api/obs/published/events', 'obs-published', value))));
  function handle(req, res) {
    const allowed = ['http://127.0.0.1:', 'http://localhost:', 'http://[::1]:'].map(x => x + req.socket.localPort);
    if (req.headers.origin && !allowed.includes(req.headers.origin)) { res.writeHead(403).end(); return; }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n'); clients.add(res);
    send(res, packet('/api/live-timer/events', 'timer', timer.snapshot()));
    if (obsPublished) send(res, packet('/api/obs/published/events', 'obs-published', obsPublished.state()));
    for (const channel of ['theme', 'chat']) {
      send(res, packet('/api/editor-messages/' + channel + '/events', 'source', messages.snapshot(channel)));
      send(res, packet('/api/theme-publish/' + channel + '/events', 'published', published.snapshot(channel)));
      for (const value of messages.recent(channel)) send(res, packet('/api/editor-messages/' + channel + '/events', 'preview', value));
    }
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 12000);
    res.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
  }
  return { handle, close() { unsubscribe.forEach(fn => fn()); for (const res of clients) res.end(); clients.clear(); } };
}
module.exports = { createStudioEvents };
