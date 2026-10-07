'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const fs = require('node:fs'), path = require('node:path');
const Recovery = require('../app/live-recovery'), { createMessageJournal } = require('../app/live-message-journal');
const turn = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const nodes = new Map(), sources = [], live = [], restores = [], displayed = new Map(), events = {};
  let inspecting = false, sourceChanges = 0;
  const node = id => {
    if (nodes.has(id)) return nodes.get(id);
    const value = { value: '', style: {}, checked: false, hidden: false, listeners: {},
      addEventListener(name, fn) { this.listeners[name] = fn; }, removeAttribute() {}, setAttribute() {}, focus() {}, before() {}, after() {}, closest: () => node('container-' + id), querySelector: () => node('option-' + id) };
    nodes.set(id, value); return value;
  };
  class Stream { constructor() { this.listeners = {}; sources.push(this); } addEventListener(name, fn) { this.listeners[name] = fn; } close() {} }
  const state = { phase: 'connected', roomId: '12345', roomInput: '12345', received: 2, message: 'QA' };
  const window = { ThemeServices: { bilibili: 'http://test-only' }, BilibiliLogin: { mount: () => ({ apply() {} }) }, LiveMessageJournal: { create: createMessageJournal }, addEventListener(name, fn) { events[name] = fn; } };
  const store = new Map();
  const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/bilibili-live.js'), 'utf8'), {
    window, document: { getElementById: node, createElement: () => node('created-' + nodes.size) }, sessionStorage: storage, localStorage: storage,
    LiveRecovery: Recovery, URLSearchParams, location: { search: '?source=live' }, EventSource: Stream, AbortSignal, clearInterval, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ service: 'hiss-bilibili', version: 5, token: 'synthetic', status: state, login: {} }) }),
  });
  const key = value => value.scId || value.eventId;
  const controller = window.BilibiliLive.mount({ setSource() { sourceChanges++; }, status() {}, reset() { if (!inspecting) displayed.clear(); },
    restore(items) { if (inspecting) return; restores.push(items); items.forEach(item => displayed.set(key(item), item)); },
    receive(item) { if (inspecting) return true; live.push(item); displayed.set(key(item), item); return true; },
    remove(ids) { if (!inspecting) ids.forEach(id => displayed.delete(id)); },
  });
  const emit = (event, value) => sources[0].listeners[event]({ data: JSON.stringify(value) });
  return { nodes, live, restores, displayed, state, emit, events, controller, sources,
    inspect(value) { inspecting = value; }, get sourceChanges() { return sourceChanges; },
    source(value) { node('messageSource').value = value; node('messageSource').listeners.change(); }, close() { events.pagehide(); } };
}
test('late live views recover existing SC, reconnect silently, and never resurrect removed SC', async t => {
  const f = fixture(); t.after(() => f.close()); await turn();
  const now = Date.now(), paid = { kind: 'sc', scId: 'paid-1', eventId: 'paid-1', sender: '支持者', body: '仍在倒计时', receivedAt: now - 10000, expiresAt: now + 90000, roomId: '12345' };
  f.emit('status', f.state); f.emit('snapshot', { roomId: '12345', items: [paid] });
  assert(f.displayed.has('paid-1')); assert.equal(f.live.length, 0, 'snapshot does not replay a live entrance');
  f.emit('message', { kind: 'normal', eventId: 'one', sender: '观众', body: '新消息', receivedAt: now, roomId: '12345' });
  assert.equal(f.live.length, 1);
  f.emit('error'); f.emit('status', f.state); f.emit('snapshot', { roomId: '12345', items: [paid, f.live[0]] });
  assert.equal(f.live.length, 1); assert.equal(f.displayed.size, 2);
  f.emit('message', { kind: 'delete', roomId: '12345', scIds: ['paid-1'] });
  assert(!f.displayed.has('paid-1'));
  f.emit('snapshot', { roomId: '12345', items: [f.live[0]] });
  assert(!f.displayed.has('paid-1'));
});
test('messages accumulated while showing a simulation are restored when selecting the real room again', async t => {
  const f = fixture(); t.after(() => f.close()); await turn();
  f.emit('status', f.state); f.emit('snapshot', { roomId: '12345', items: [] });
  f.source('simulation');
  f.emit('message', { kind: 'normal', eventId: 'during-simulation', sender: '观众', body: '稍后接续', receivedAt: Date.now(), roomId: '12345' });
  assert.equal(f.live.length, 0);
  f.source('live');
  assert(f.displayed.has('during-simulation'));
  assert.equal(f.live.length, 0, 'restoration must remain silent');
});

test('ending local editor inspection restores current journal without switching source or reconnecting', async t => {
  const f = fixture(); t.after(() => f.close()); await turn();
  const now = Date.now(), paid = { kind: 'sc', scId: 'removed-during-preview', eventId: 'sc-one', sender: '支持者', body: '真实 SC', receivedAt: now - 10000, expiresAt: now + 90000, roomId: '12345' };
  f.emit('status', f.state); f.emit('snapshot', { roomId: '12345', items: [paid] });
  const sourceChanges = f.sourceChanges, streams = f.sources.length;
  f.inspect(true); f.displayed.clear(); f.displayed.set('local-demo', { kind: 'fleet' });
  f.emit('message', { kind: 'normal', eventId: 'during-inspection', sender: '观众', body: '最新上下文', receivedAt: now, roomId: '12345' });
  f.emit('message', { kind: 'delete', roomId: '12345', scIds: ['removed-during-preview'] });
  f.emit('message', { ...paid, scId: 'expired', eventId: 'expired', expiresAt: now - 1 });
  assert.deepEqual([...f.displayed.keys()], ['local-demo'], 'real arrivals cannot mix into the inspection canvas');
  f.inspect(false); assert.equal(f.controller.restoreCurrent(), true);
  assert.deepEqual([...f.displayed.keys()], ['during-inspection']);
  assert.equal(f.live.length, 0, 'returning restores silently, with no fleet or SC entrance replay');
  assert.equal(f.sourceChanges, sourceChanges); assert.equal(f.sources.length, streams);
  assert.equal(f.controller.isLive(), true);
});
