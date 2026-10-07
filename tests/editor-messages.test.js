'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createEditorMessages } = require('../app/editor-message-server');
const { createPreviewServer } = require('../app/preview-server');

test('editor test actions stay local until explicitly mirrored while real source changes still synchronize', async () => {
  const vm = require('node:vm'), requests = [], listeners = {};
  class Events { constructor() {} addEventListener() {} close() {} }
  const window = { addEventListener(name, fn) { listeners[name] = fn; }, dispatchEvent() {} };
  const context = vm.createContext({ window, URLSearchParams, EventSource: Events, crypto: require('node:crypto').webcrypto, AbortSignal,
    location: { search: '?editor=1', hash: '', origin: 'http://127.0.0.1:1234' },
    parent: { location: { pathname: '/theme-editor.html' }, postMessage() {} },
    CustomEvent: class {}, cancelAnimationFrame() {},
    fetch: async (_url, request) => { requests.push(JSON.parse(request.body)); return { ok: true, json: async () => ({}) }; },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/editor-message-sync.js'), 'utf8'), context);
  assert.equal(await window.EditorMessageSync.publish('editor-demo'), false);
  assert.equal(requests.length, 0);
  listeners['live-message-source']({ detail: 'live' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests[0].command, 'source');
  assert.equal(requests[0].source, 'live');
  window.EditorMessageSync.setMirroring(true);
  assert.equal(await window.EditorMessageSync.publish('editor-send', { kind: 'normal', body: '显式直播测试' }), true);
  assert.equal(requests[1].data.body, '显式直播测试');
  window.EditorMessageSync.setMirroring(false);
  assert.equal(await window.EditorMessageSync.publish('clear'), false);
  assert.equal(requests.length, 2);
});

test('message selection persists outside theme exports; another page cannot reseed a selected source', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-msg-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = createEditorMessages({ dataRoot: dir });
  service.command('theme', { command: 'source', id: 'request-1', writer: 'writer-one', source: 'live', initialize: true });
  service.command('theme', { command: 'source', id: 'request-2', writer: 'writer-two', source: 'simulation', initialize: true });
  assert.equal(service.snapshot('theme').source, 'live');
  assert.equal(service.snapshot('chat').source, 'live');
  assert.equal(createEditorMessages({ dataRoot: dir }).snapshot('theme').source, 'live');
  assert(require('../scripts/package').excluded('app/editor-message-state.json'));
  const model = require('../app/theme-editor-model');
  const doc = model.create('classic');
  doc.settings.liveSession = 'secret'; doc.settings.messageSource = 'live';
  assert.equal(model.normalize(doc).settings.liveSession, undefined);
  assert.equal(model.normalize(doc).settings.messageSource, undefined);
});

test('real message source is shared by both editors while their explicit test streams remain separate', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-msg-shared-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = createEditorMessages({ dataRoot: dir }), events = [];
  service.subscribe((channel, event, value) => events.push({ channel, event, value }));
  service.command('chat', { command: 'source', source: 'live', id: 'source-live', writer: 'chat-window' });
  assert.equal(service.snapshot('theme').source, 'live');
  assert.equal(service.snapshot('chat').source, 'live');
  assert.equal(events.filter(item => item.event === 'source').length, 2);
  assert.equal(service.snapshot('theme').revision, 1);
  service.command('chat', { command: 'editor-send', id: 'send-chat-only', writer: 'chat-window', data: { kind: 'normal', body: '只同步此输出' } });
  assert.equal(service.recent('theme').length, 0);
  assert.equal(service.recent('chat').length, 1);
  service.command('theme', { command: 'source', source: 'simulation', id: 'source-simulation', writer: 'theme-window' });
  assert.equal(service.snapshot('chat').source, 'simulation');
  assert.equal(service.snapshot('theme').revision, 2);
  assert.equal(service.recent('chat').length, 0);
});

test('preview SSE reaches another origin, deduplicates retry, replays only new events and rejects foreign writers', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-msg-http-'));
  const app = createPreviewServer({ port: 0, dataRoot: dir });
  t.after(async () => { app.server.closeAllConnections(); await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const { port } = await app.listen(), base = `http://127.0.0.1:${port}`;
  const command = { id: 'test-message-1', writer: 'editor-one', command: 'editor-send', data: { kind: 'normal', sender: '测试', body: '送达 OBS', liveSession: 'private' } };
  const post = (body, origin = base) => fetch(base + '/api/editor-messages/theme', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await post(command)).status, 200);
  assert.equal((await post(command)).status, 200);
  const r = await fetch(`http://localhost:${port}/api/editor-messages/theme/events`, { signal: AbortSignal.timeout(5000) });
  const reader = r.body.getReader(), chunk = new TextDecoder().decode((await reader.read()).value);
  assert.equal((chunk.match(/event: preview/g) || []).length, 1);
  assert.match(chunk, /送达 OBS/); assert(!chunk.includes('private'));
  const cursor = /id: ([^\n]+)/.exec(chunk)[1];
  await reader.cancel();
  const resumed = await fetch(base + '/api/editor-messages/theme/events', { headers: { 'Last-Event-ID': cursor }, signal: AbortSignal.timeout(5000) });
  const resumedReader = resumed.body.getReader();
  assert(!new TextDecoder().decode((await resumedReader.read()).value).includes('event: preview'));
  assert.equal((await post({ ...command, id: 'source-change', command: 'source', source: 'live' })).status, 200);
  assert.match(new TextDecoder().decode((await resumedReader.read()).value), /"source":"live"/);
  await resumedReader.cancel();
  assert.equal((await post(command, 'https://example.com')).status, 403);
  assert.equal((await post({ ...command, id: 'bad-command', command: 'connect' })).status, 400);
  assert.equal((await fetch(base + '/editor-message-state.json')).status, 404);
});

test('invalid sources, message types and channels are rejected', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-msg-input-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = createEditorMessages({ dataRoot: dir });
  assert.throws(() => service.command('theme', { command: 'source', id: 'request-1', writer: 'writer-one', source: 'bad' }));
  assert.throws(() => service.command('theme', { command: 'editor-send', id: 'request-2', writer: 'writer-one', data: { kind: 'unknown' } }));
  assert.throws(() => service.command('unknown', { command: 'clear', id: 'request-3', writer: 'writer-one' }));
});

test('rapid source changes send the latest intent and disabling mirroring cancels queued test messages', async () => {
  const vm = require('node:vm'), sent = [], handlers = {}, releases = [];
  const window = { addEventListener(name, fn) { handlers[name] = fn; }, dispatchEvent() {} };
  class Source { addEventListener() {} close() {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/editor-message-sync.js'), 'utf8'), {
    window, URLSearchParams, crypto: require('node:crypto').webcrypto, EventSource: Source, AbortSignal,
    location: { search: '?editor=1', hash: '', origin: 'http://localhost' }, parent: { location: { pathname: '/theme-editor.html' }, postMessage() {} }, CustomEvent: class {}, cancelAnimationFrame() {},
    fetch(_url, request) { sent.push(JSON.parse(request.body)); return new Promise(resolve => releases.push(() => resolve({ ok: true, json: async () => ({}) }))); },
  });
  for (let i = 0; i < 100; i++) handlers['live-message-source']({ detail: i === 99 ? 'live' : 'simulation' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 1); assert.equal(sent[0].source, 'live');
  releases.shift()(); await new Promise(resolve => setImmediate(resolve));
  window.EditorMessageSync.setMirroring(true);
  const first = window.EditorMessageSync.publish('editor-send', { kind: 'normal', body: '已发出' });
  await new Promise(resolve => setImmediate(resolve));
  const queued = window.EditorMessageSync.publish('editor-send', { kind: 'normal', body: '取消排队' });
  window.EditorMessageSync.setMirroring(false);
  releases.shift()(); await first;
  assert.equal(await queued, false);
  assert.equal(sent.length, 2);
  handlers.pagehide();
});
