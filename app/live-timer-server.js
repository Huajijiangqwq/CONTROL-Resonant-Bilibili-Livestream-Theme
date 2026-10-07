'use strict';
// One clock per local theme service, shared by the desktop, browsers and OBS.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const State = require('./live-state');
function createTimer({ dataRoot, now = Date.now }) {
  const file = path.join(dataRoot, 'timer-state.json'), clients = new Set(), receipts = new Map(), observers = new Set();
  const instance = crypto.randomUUID();
  let clock = { elapsedMs: 0, startedAt: now() }, revision = 0, initialized = false;
  const validTime = value => Number.isSafeInteger(value) && value >= 0 && value <= 36e12;
  function validate(value) {
    if (!value || !validTime(value.elapsedMs) ||
        !(value.startedAt === null || (Number.isSafeInteger(value.startedAt) && value.startedAt > 0)))
      throw Error('计时状态无效');
    return { elapsedMs: value.elapsedMs, startedAt: value.startedAt === null ? null : Math.min(value.startedAt, now()) };
  }
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    clock = validate(saved); initialized = true;
  } catch {}
  const snapshot = () => ({ ...clock, revision, instance, initialized, serverNow: now() });
  function persist(next) {
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  const packet = () => 'event: timer\ndata: ' + JSON.stringify(snapshot()) + '\n\n';
  function broadcast() {
    for (const callback of observers) callback(snapshot());
    const text = packet();
    for (const client of clients) {
      if (client.destroyed || client.writableLength > 65536) { clients.delete(client); client.end(); }
      else client.write(text);
    }
  }
  function command(input) {
    if (!input || !['init', 'pause', 'resume', 'reset', 'set'].includes(input.action)) throw Error('计时操作无效');
    const id = input.id;
    if (typeof id !== 'string' || !/^[\w-]{8,100}$/.test(id)) throw Error('计时请求无效');
    if (receipts.has(id) || (input.action === 'init' && initialized)) return snapshot();
    const time = now();
    let next = { ...clock };
    if (input.action === 'init') next = input.seed ? validate(input.seed) : next;
    if (input.action === 'pause' && next.startedAt !== null) next = { elapsedMs: Math.floor(State.elapsed(next, time)), startedAt: null };
    if (input.action === 'resume' && next.startedAt === null) next.startedAt = time;
    if (input.action === 'reset') next = State.reset(next, time);
    if (input.action === 'set') {
      if (!validTime(input.elapsedMs)) throw Error('已播时长无效');
      next = { elapsedMs: input.elapsedMs, startedAt: next.startedAt === null ? null : time };
    }
    // Do not announce success until the recoverable state is on disk.
    persist(next);
    clock = next; initialized = true; revision++;
    receipts.set(id, true);
    if (receipts.size > 256) receipts.delete(receipts.keys().next().value);
    broadcast();
    return snapshot();
  }
  function handle(req, res) {
    const url = new URL(req.url, 'http://' + req.headers.host);
    const origin = req.headers.origin;
    const port = req.socket.localPort;
    if (origin && !['http://127.0.0.1:' + port, 'http://localhost:' + port, 'http://[::1]:' + port].includes(origin)) {
      res.writeHead(403).end(); return;
    }
    if (url.pathname === '/api/live-timer/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(packet()); clients.add(res);
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
      res.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
      return;
    }
    const json = (status, data) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(data));
    if (url.pathname !== '/api/live-timer') { res.writeHead(404).end(); return; }
    if (req.method === 'GET') { json(200, snapshot()); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    if (!origin || !String(req.headers['content-type']).startsWith('application/json')) { res.writeHead(403).end(); return; }
    let bytes = 0, chunks = [];
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 16384) { res.writeHead(413).end(); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { json(400, { error: '计时请求无效' }); return; }
      try { json(200, command(input)); }
      catch (error) { json(error.code ? 500 : 400, { error: error.code ? '计时状态保存失败，请检查数据目录。' : error.message }); }
    });
  }
  return { handle, snapshot, command, subscribe(callback) { observers.add(callback); return () => observers.delete(callback); }, close() { for (const client of clients) client.end(); clients.clear(); observers.clear(); } };
}
module.exports = { createTimer };
