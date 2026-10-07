'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createPreviewServer } = require('../app/preview-server');
const model = require('../app/theme-editor-model');

test('the combined stream carries clock, published layouts and messages while ordinary requests remain free', async t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-events-'));
  const app = createPreviewServer({ port: 0, dataRoot });
  t.after(async () => { app.server.closeAllConnections(); await app.close(); fs.rmSync(dataRoot, { recursive: true, force: true }); });
  const { port } = await app.listen(), base = `http://127.0.0.1:${port}`;
  const stream = await fetch(base + '/api/studio-events', { signal: AbortSignal.timeout(10000) }), reader = stream.body.getReader();
  let buffer = '';
  async function receive(phrase) {
    for (let i = 0; i < 30; i++) {
      if (buffer.includes(phrase)) { const found = buffer; buffer = ''; return found; }
      buffer += new TextDecoder().decode((await reader.read()).value);
    }
    throw Error('Missing event ' + phrase);
  }
  await receive('/api/theme-publish/chat/events');
  const post = (route, value) => fetch(base + route, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  await post('/api/live-timer', { action: 'pause', id: 'timer-request-1' });
  assert.match(await receive('"event":"timer"'), /"startedAt":null/);
  await post('/api/theme-publish/theme', { revision: 0, document: model.create('classic') });
  assert.match(await receive('"event":"published"'), /"revision":1/);
  await post('/api/editor-messages/theme', { command: 'editor-send', id: 'message-request-1', writer: 'studio-test', data: { kind: 'normal', body: '消息与布局共用连接' } });
  assert.match(await receive('"event":"preview"'), /消息与布局共用连接/);
  assert.equal((await fetch(base + '/api/projects')).status, 200);
  await reader.cancel();
});

test('eight pages share one worker event stream and closing one page does not disconnect the rest', async () => {
  const events = [], ports = [], timers = new Set();
  class SSE {
    constructor(url) { this.url = url; this.handlers = {}; this.closed = false; events.push(this); }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    close() { this.closed = true; }
  }
  const worker = { onconnect: null };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/studio-events-worker.js'), 'utf8'), { self: worker, EventSource: SSE, Date, Map, Set, JSON });
  class Worker {
    constructor() {
      const incoming = { onmessage: null, start() {}, close() {}, postMessage: value => queueMicrotask(() => outgoing.onmessage?.({ data: value })) };
      const outgoing = { onmessage: null, start() {}, close() {}, postMessage: value => queueMicrotask(() => incoming.onmessage?.({ data: value })) };
      this.port = outgoing; ports.push(incoming);
      queueMicrotask(() => worker.onconnect({ ports: [incoming] }));
    }
  }
  const pages = [], received = [];
  for (let i = 0; i < 8; i++) {
    const callbacks = {}, window = { addEventListener(name, fn) { callbacks[name] = fn; } };
    const context = { window, parent: window, location: { origin: 'http://localhost' }, SharedWorker: Worker, EventSource: SSE, Date, Map, Set, JSON, queueMicrotask,
      setTimeout(fn, ms) { const timer = setTimeout(fn, ms); timers.add(timer); return timer; }, clearTimeout,
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/studio-events.js'), 'utf8'), context);
    const timer = window.StudioEvents.open('/api/live-timer/events');
    timer.addEventListener('timer', event => received.push([i, JSON.parse(event.data).revision]));
    window.StudioEvents.open('/api/theme-publish/theme/events');
    pages.push(callbacks);
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.length, 1);
  assert.equal(events[0].url, '/api/studio-events');
  events[0].handlers.studio({ data: JSON.stringify({ path: '/api/live-timer/events', event: 'timer', data: { revision: 9 } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(received.length, 8);
  pages[0].pagehide(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(events[0].closed, false);
  events[0].handlers.studio({ data: JSON.stringify({ path: '/api/live-timer/events', event: 'timer', data: { revision: 10 } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(received.length, 15);
  for (const page of pages.slice(1)) page.pagehide();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events[0].closed, true);
  for (const timer of timers) clearTimeout(timer);
});

test('worker replay keeps equal sequence numbers in separate message channels independent', () => {
  let source;
  class SSE { constructor() { source = this; this.events = {}; } addEventListener(name, fn) { this.events[name] = fn; } close() {} }
  const worker = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/studio-events-worker.js'), 'utf8'), { self: worker, EventSource: SSE, Date, Map, Set, JSON });
  const port = () => ({ values: [], start() {}, close() {}, postMessage(value) { this.values.push(value); } });
  worker.onconnect({ ports: [port()] });
  for (const channel of ['theme', 'chat']) source.events.studio({ data: JSON.stringify({ path: '/api/editor-messages/' + channel + '/events', event: 'preview', data: { command: 'editor-send', sequence: 1, epoch: 'same-server', at: Date.now(), body: channel } }) });
  const later = port(); worker.onconnect({ ports: [later] });
  assert.equal(later.values.filter(item => item.type === 'packet').length, 2);
  assert.deepEqual(later.values.filter(item => item.type === 'packet').map(item => item.value.data.body).sort(), ['chat', 'theme']);
});

test('OBS without SharedWorker still multiplexes consumers and child renderers into one stream', () => {
  const created = [], callbacks = {};
  class SSE { constructor(url) { this.url = url; created.push(this); } addEventListener() {} close() {} }
  const window = { location: { origin: 'http://localhost' }, addEventListener(name, fn) { callbacks[name] = fn; } };
  const source = fs.readFileSync(path.join(__dirname, '../app/studio-events.js'), 'utf8');
  vm.runInNewContext(source, { window, parent: window, location: window.location, EventSource: SSE, setTimeout, clearTimeout, queueMicrotask });
  for (const path of ['/api/live-timer/events', '/api/theme-publish/theme/events', '/api/editor-messages/theme/events']) window.StudioEvents.open(path);
  const child = {};
  vm.runInNewContext(source, { window: child, parent: window, location: window.location });
  child.StudioEvents.open('/api/editor-messages/theme/events');
  assert.equal(created.length, 1);
  assert.equal(child.StudioEvents, window.StudioEvents);
  callbacks.pagehide();
});

test('a failing consumer cannot interrupt another clock or message consumer on the shared transport', async () => {
  let stream;
  class SSE { constructor() { stream = this; this.events = {}; } addEventListener(name, fn) { this.events[name] = fn; } close() {} }
  const handlers = {}, window = { location: { origin: 'http://localhost' }, addEventListener(name, fn) { handlers[name] = fn; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/studio-events.js'), 'utf8'), { window, parent: window, location: window.location, EventSource: SSE, setTimeout, clearTimeout, queueMicrotask, console: { error() {} } });
  const bad = window.StudioEvents.open('/api/live-timer/events'), healthy = window.StudioEvents.open('/api/live-timer/events');
  bad.addEventListener('timer', () => { throw Error('preview renderer failed'); });
  let received = 0; healthy.addEventListener('timer', () => { received++; });
  await new Promise(resolve => setImmediate(resolve));
  stream.events.studio({ data: JSON.stringify({ path: '/api/live-timer/events', event: 'timer', data: { revision: 1 } }) });
  assert.equal(received, 1); handlers.pagehide();
});
