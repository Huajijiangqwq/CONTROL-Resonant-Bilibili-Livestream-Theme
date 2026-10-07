'use strict';
// Publication is a separate checkpoint. Saving a draft never changes live output.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { cleanDocument } = require('./project-library-server.js');
function createThemePublish({ dataRoot, model, now = Date.now }) {
  const file = path.join(dataRoot, 'theme-live', 'published.json'), epoch = crypto.randomUUID();
  const states = new Map(), clients = new Map(['theme', 'chat'].map(key => [key, new Set()])), observers = new Set();
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const channel of clients.keys()) if (saved[channel]?.document) {
      const value = saved[channel];
      states.set(channel, { ...value, document: cleanDocument(value.document, model(), { allowOversize: true }) });
    }
  } catch {}
  const snapshot = channel => ({ channel, epoch, revision: 0, document: null, ...(states.get(channel) || {}) });
  const event = (res, value) => res.write('event: published\ndata: ' + JSON.stringify(value) + '\n\n');
  function publish(channel, input) {
    if (!clients.has(channel)) throw Error('直播输出不存在');
    const current = snapshot(channel), raw = input?.document;
    if (!raw || raw.format !== 'control-theme' || raw.version !== 1 || !Array.isArray(raw.layers)) throw Error('主题格式无效');
    if (input.revision !== current.revision) throw Object.assign(Error('直播版本已被另一页更新，请查看最新状态后再应用。'), { status: 409 });
    const issue = model().capacityIssue(raw);
    if (issue) throw Error(issue);
    const document = cleanDocument(raw, model());
    const output = input.output === 'chat' ? 'chat' : 'scene';
    const chat = document.layers.find(l => l.type === 'chat' && l.id === input.chatId) || document.layers.find(l => l.type === 'chat');
    if (output === 'chat' && !chat) throw Error('当前主题没有组合弹幕区');
    if (output === 'chat' && input.chatId && chat.id !== input.chatId) throw Error('选择的弹幕区已删除，请重新选择输出目标');
    if (output === 'chat' && chat) {
      const effective = model().effective(document, chat);
      if (!effective.visible || effective.opacity === 0) throw Error('选择的弹幕区已隐藏或完全透明，请先显示它再单独输出');
    }
    const value = {
      revision: current.revision + 1, document, output, chatId: output === 'chat' ? chat.id : '',
      name: Array.from(String(input.name || document.name || '未命名主题')).slice(0, 100).join(''),
      projectId: /^[a-f0-9-]{8,80}$/i.test(input.projectId || '') ? input.projectId : '',
      writer: /^[\w-]{8,80}$/.test(input.writer || '') ? input.writer : '',
      appliedAt: now(),
    };
    const saved = Object.fromEntries(states); saved[channel] = value;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(saved), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
    states.set(channel, value);
    const next = snapshot(channel);
    for (const callback of observers) callback(channel, next);
    for (const res of clients.get(channel)) {
      if (res.destroyed || res.writableLength > 48 * 1024 * 1024) { res.end(); clients.get(channel).delete(res); }
      else event(res, next);
    }
    return next;
  }
  function handle(req, res) {
    const url = new URL(req.url, 'http://' + req.headers.host), match = /^\/api\/theme-publish(?:\/(theme|chat))?(\/events)?$/.exec(url.pathname);
    const json = (code, value) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));
    if (!match) { json(404, { error: '直播输出不存在' }); return; }
    const channel = match[1] || 'theme', origin = req.headers.origin;
    const allowed = ['http://127.0.0.1:', 'http://localhost:', 'http://[::1]:'].map(x => x + req.socket.localPort);
    if (origin && !allowed.includes(origin)) { res.writeHead(403).end(); return; }
    if (req.method === 'GET' && match[2]) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 1000\n\n'); event(res, snapshot(channel)); clients.get(channel).add(res);
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 12000);
      res.on('close', () => { clearInterval(heartbeat); clients.get(channel).delete(res); }); return;
    }
    if (req.method === 'GET') { json(200, snapshot(channel)); return; }
    if (req.method !== 'POST' || match[2]) { res.writeHead(405).end(); return; }
    if (!origin || !String(req.headers['content-type']).startsWith('application/json')) { res.writeHead(403).end(); return; }
    let size = 0, chunks = [];
    req.on('data', part => { size += part.length; if (size > 40 * 1024 * 1024) { res.writeHead(413).end(); req.destroy(); } else chunks.push(part); });
    req.on('end', () => {
      if (res.writableEnded) return;
      try { json(200, publish(channel, JSON.parse(Buffer.concat(chunks).toString('utf8')))); }
      catch (error) { json(error.status || (error.code ? 500 : 400), { error: error.code ? '直播主题保存失败，原输出保持不变' : error.message }); }
    });
  }
  return { snapshot, publish, handle, subscribe(callback) { observers.add(callback); return () => observers.delete(callback); }, close() { for (const set of clients.values()) for (const res of set) res.end(); observers.clear(); } };
}
module.exports = { createThemePublish };
