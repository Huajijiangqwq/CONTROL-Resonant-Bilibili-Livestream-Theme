'use strict';
// Runtime message routing is separate from shareable themes and login credentials.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function createEditorMessages({ dataRoot, now = Date.now }) {
  const file = path.join(dataRoot, 'editor-message-state.json'), epoch = crypto.randomUUID();
  const observers = new Set();
  let sourceRevision = 0;
  const channels = new Map(['theme', 'chat'].map(id => [id, { channel: id, source: null, sequence: 0, clients: new Set(), journal: [], receipts: new Set() }]));
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const source = [saved.source, saved.theme, saved.chat].find(value => ['live', 'simulation'].includes(value));
    for (const s of channels.values()) if (source) s.source = source;
  } catch {}
  const snapshot = id => ({ channel: id, source: channels.get(id).source, epoch, revision: sourceRevision });
  function save(source) {
    const data = { source, theme: source, chat: source };
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  const send = (client, event, value, id) => client.write((id ? 'id: ' + id + '\n' : '') + 'event: ' + event + '\ndata: ' + JSON.stringify(value) + '\n\n');
  function emit(s, event, value, id) {
    for (const callback of observers) callback(s.channel, event, value);
    for (const client of s.clients) {
      if (client.destroyed || client.writableLength > 262144) { client.end(); s.clients.delete(client); }
      else send(client, event, value, id);
    }
  }
  function command(channel, input) {
    const s = channels.get(channel);
    if (!s || !input || !/^[\w-]{8,80}$/.test(input.id || '') || !/^[\w-]{8,80}$/.test(input.writer || '')) throw Error('消息同步请求无效');
    if (s.receipts.has(input.id)) return snapshot(channel);
    if (input.command === 'source') {
      if (!['live', 'simulation'].includes(input.source)) throw Error('消息来源无效');
      if (!input.initialize || s.source === null) {
        if (s.source !== input.source) {
          save(input.source); sourceRevision++;
          for (const channel of channels.values()) { channel.source = input.source; channel.journal = []; }
        }
        for (const [id, channel] of channels) emit(channel, 'source', snapshot(id));
      }
    } else {
      if (!['editor-send', 'editor-demo', 'clear'].includes(input.command)) throw Error('不支持的预览操作');
      const raw = input.data || {}, data = {};
      if (input.command === 'editor-send') {
        if (!['normal', 'sc', 'gift', 'fleet'].includes(raw.kind)) throw Error('消息类型无效');
        data.kind = raw.kind;
        for (const [key, limit] of [['sender', 50], ['body', 1600], ['giftName', 60], ['layerId', 100], ['styleKey', 100]])
          if (typeof raw[key] === 'string') data[key] = Array.from(raw[key]).slice(0, limit).join('');
        data.rank = ['captain', 'admiral', 'governor'].includes(raw.rank) ? raw.rank : 'captain';
        data.tier = Math.max(0, Math.min(6, Math.round(Number(raw.tier) || 0)));
        for (const [key, min, max] of [['duration', 1, 7200], ['quantity', 1, 999999], ['value', 0, 999999999]])
          if (Number.isFinite(Number(raw[key]))) data[key] = Math.max(min, Math.min(max, Number(raw[key])));
      }
      const item = { command: input.command, data, writer: input.writer, sequence: ++s.sequence, epoch, at: now() };
      if (input.command !== 'editor-send') s.journal = [];
      s.journal = s.journal.filter(v => now() - v.at < 30000).slice(-99);
      s.journal.push(item);
      emit(s, 'preview', item, epoch + ':' + item.sequence);
    }
    s.receipts.add(input.id);
    if (s.receipts.size > 500) s.receipts.delete(s.receipts.values().next().value);
    return snapshot(channel);
  }
  function handle(req, res) {
    const url = new URL(req.url, 'http://' + req.headers.host), match = /^\/api\/editor-messages\/(theme|chat)(\/events)?$/.exec(url.pathname);
    const json = (status, value) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));
    if (!match) { json(404, { error: '消息通道不存在' }); return; }
    const id = match[1], s = channels.get(id), origin = req.headers.origin;
    const allowed = ['http://127.0.0.1:', 'http://localhost:', 'http://[::1]:'].map(x => x + req.socket.localPort);
    if (origin && !allowed.includes(origin)) { res.writeHead(403).end(); return; }
    if (req.method === 'GET' && match[2]) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 1000\n\n'); send(res, 'source', snapshot(id)); s.clients.add(res);
      const previous = String(req.headers['last-event-id'] || '');
      const cursor = previous.startsWith(epoch + ':') ? Number(previous.slice(epoch.length + 1)) || 0 : 0;
      for (const item of s.journal) if (now() - item.at < 30000 && item.sequence > cursor)
        send(res, 'preview', item, epoch + ':' + item.sequence);
      const beat = setInterval(() => res.write(': heartbeat\n\n'), 12000);
      res.on('close', () => { clearInterval(beat); s.clients.delete(res); }); return;
    }
    if (req.method === 'GET') { json(200, snapshot(id)); return; }
    if (req.method !== 'POST' || match[2]) { res.writeHead(405).end(); return; }
    if (!origin || !String(req.headers['content-type']).startsWith('application/json')) { res.writeHead(403).end(); return; }
    let bytes = 0, chunks = [];
    req.on('data', part => { bytes += part.length; if (bytes > 16384) { res.writeHead(413).end(); req.destroy(); } else chunks.push(part); });
    req.on('end', () => {
      if (res.writableEnded) return;
      try { json(200, command(id, JSON.parse(Buffer.concat(chunks).toString('utf8')))); }
      catch (e) { json(e.code ? 500 : 400, { error: e.code ? '消息同步状态保存失败' : e.message }); }
    });
  }
  return { handle, command, snapshot, recent(channel) { return channels.get(channel).journal.filter(item => now() - item.at < 30000); }, subscribe(callback) { observers.add(callback); return () => observers.delete(callback); }, close() { for (const s of channels.values()) for (const client of s.clients) client.end(); observers.clear(); } };
}
module.exports = { createEditorMessages };
