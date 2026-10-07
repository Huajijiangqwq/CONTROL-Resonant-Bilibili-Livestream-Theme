'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const fs = require('node:fs'), path = require('node:path'), State = require('../app/live-state'), AudioConfig = require('../app/audio-config');
test('authoring, applied and snapshot renderers never persist over original preset preferences', () => {
  for (const query of ['editor=1', 'obs=1', 'theme=0123456789abcdef01234567&pure=1', 'published=theme', 'libraryPreview=1']) {
    let writes = 0;
    if (State.storesPreset(new URLSearchParams(query))) writes++;
    assert.equal(writes, 0, query);
  }
  assert.equal(State.storesPreset(new URLSearchParams('pure=1&layout=split'), new URLSearchParams('theme=test')), false);
  assert.equal(State.storesPreset(new URLSearchParams('layout=classic')), true);
});
test('rendering saved settings cannot post audio controls, while an explicit audio Apply still does', async t => {
  const nodes = new Map(), requests = [], handlers = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', tagName: 'INPUT', type: 'text', checked: false, listeners: {}, textContent: '', setAttribute() {}, replaceChildren() {}, append() {}, addEventListener(type, fn) { this.listeners[type] = fn; }, dispatchEvent(event) { this.listeners[event.type]?.(event); } });
    return nodes.get(id);
  };
  class Events { close() {} }
  const context = {
    window: { ThemeServices: { audio: 'http://127.0.0.1:19034' }, addEventListener(name, fn) { handlers[name] = fn; } },
    document: { getElementById: node, createElement: () => node('option-' + nodes.size), activeElement: null },
    location: { search: '?theme=snapshot&pure=1' }, URLSearchParams, AudioConfig, AudioEnvelope: { create: () => ({}) },
    performance: { now: () => 0 }, EventSource: Events, setTimeout, clearTimeout, AbortSignal,
    fetch: async (url, request) => { requests.push({ url, body: JSON.parse(request.body) }); return { ok: true, json: async () => ({ enabled: false, gain: 2, amount: 0.8, sources: [], source: 'desktop', bandConfig: AudioConfig.defaults() }) }; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/live-audio.js'), 'utf8'), context);
  t.after(() => handlers.pagehide());
  const oldSettings = { audioSource: 'old-device', audioGain: 400, audioAmount: 100, audioApply: true, 'band0-from': 500, timerOffset: '05:00:00', hostInput: '保存的标题' };
  for (const [id, value] of State.documentSettings(oldSettings)) { const field = node(id); field.value = value; field.dispatchEvent({ type: 'input' }); field.dispatchEvent({ type: 'change' }); }
  assert.equal(requests.length, 0);
  node('band0-from').value = 40;
  await node('bandApply').listeners.click();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:19034/control');
  assert.equal(requests[0].body.command, 'configure');
  assert.equal(requests[0].body.bandConfig[0].from, 40);
});
