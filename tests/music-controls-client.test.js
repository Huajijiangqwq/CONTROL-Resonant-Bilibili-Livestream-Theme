'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Settings = require('../app/now-playing-settings');
function client({ search = '', development = false, legacy = null } = {}) {
  const elements = new Map(), callbacks = [], requests = [], sources = [];
  const state = { config: { gain: 0, floor: -72, ceiling: -12, attack: 18, release: 135, tilt: 2, texture: .65, flow: 1, fps: 60, enabled: false, source: 'desktop', serviceUrl: 'http://127.0.0.1:9863', signal: { ...Settings.signalDefaults }, signalConfigured: true }, track: { hasSong: false, connected: true, title: '', artist: '', id: '', position: 0, duration: 0, stamp: Date.now() }, audio: {} };
  class Element {
    constructor() { this.value = ''; this.dataset = {}; this.style = {}; this.options = [{}]; this.listeners = {}; this.children = []; }
    set id(value) { this._id = value; elements.set(value, this); } get id() { return this._id; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
  }
  const el = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  class Envelope { configure() {} reset() {} feed() {} sample() { return new Float32Array(240); } }
  let rendered;
  class Renderer {
    constructor() { this.base = { hiss: { reset() {} } }; }
    setTrack() {} replay() {} dispose() {}
    draw(now, levels, config, pos, signal) { rendered = JSON.parse(JSON.stringify({ config, signal })); }
  }
  class EventSource {
    constructor() { this.listeners = {}; sources.push(this); }
    addEventListener(type, callback) { this.listeners[type] = callback; } close() {}
  }
  const context = {
    window: { NowPlayingSettings: Settings, ThemeDevelopment: development, addEventListener() {} },
    document: { activeElement: null, hidden: false, getElementById: el, querySelector: el, createElement: () => new Element(), createTextNode: text => text, addEventListener() {}, fonts: { load() {} } },
    location: { search, href: 'http://127.0.0.1:1/now-playing.html' + search }, URLSearchParams, URL, AbortSignal, performance, Float32Array, Date, setTimeout, clearTimeout,
    localStorage: { getItem: () => legacy ? JSON.stringify(legacy) : null },
    NowPlayingSignal: { Renderer }, NowPlayingDSP: { SpectrumEnvelope: Envelope, positionAt: () => 0 }, NowPlayingFineDSP: { SpectrumEnvelope: Envelope }, EventSource,
    requestAnimationFrame: fn => callbacks.push(fn),
    fetch: async (url, options) => new Promise(resolve => requests.push({ payload: JSON.parse(options.body), resolve })),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/now-playing.js'), 'utf8'), context);
  function emit(config = {}) { state.config = { ...state.config, ...config }; sources[0].listeners.state({ data: JSON.stringify(state) }); }
  function input(id, value) { el(id).value = String(value); if (el(id).listeners.input) el(id).listeners.input(); else el(id).oninput(); }
  function acknowledge(index) {
    const { payload, resolve } = requests[index];
    state.config = { ...state.config, ...payload, signal: { ...state.config.signal, ...payload.signal } };
    resolve({ ok: true, json: async () => JSON.parse(JSON.stringify(state)) });
  }
  return { el, emit, input, requests, acknowledge, frame(now = 0) { callbacks.at(-1)(now); return rendered; } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 220));
test('recording controls preview immediately and a delayed server acknowledgement cannot pull a newer slider backwards', async () => {
  const app = client(); app.emit();
  app.input('signal-noise', .2); assert.equal(app.frame().signal.noise, .2);
  await settle(); assert.equal(app.requests.length, 1);
  app.input('signal-noise', 2.2); app.input('flow', 1.8);
  app.emit({ signal: { ...Settings.signalDefaults, noise: .2 } });
  assert.equal(app.el('signal-noise').value, 2.2); assert.equal(app.el('flow').value, 1.8);
  await settle(); assert.equal(app.requests.length, 1, 'only one save request may be in flight');
  app.acknowledge(0); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.requests.length, 2); assert.equal(app.requests[1].payload.signal.noise, 2.2);
  assert.equal(app.el('signal-noise').value, 2.2);
  app.acknowledge(1); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.frame(32).signal.noise, 2.2); assert.equal(app.frame(64).config.flow, 1.8);
});
test('public skin ignores demo query and OBS uses shared service values rather than migrating browser-local test settings', async () => {
  const publicPage = client({ search: '?dev=1&demo=1' });
  assert.equal(publicPage.el('.mode-buttons').hidden, true); assert.equal(publicPage.el('performanceLabel').hidden, true);
  assert.equal(publicPage.el('modeLabel').textContent, '实时歌曲');
  const obs = client({ search: '?obs=1', legacy: { noise: 2.5 } });
  obs.emit({ signalConfigured: false, signal: { ...Settings.signalDefaults, noise: .35 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(obs.requests.length, 0); assert.equal(obs.frame().signal.noise, .35);
  const devPage = client({ development: true, search: '?dev=1&demo=1' });
  assert.equal(devPage.el('.mode-buttons').hidden, false); assert.equal(devPage.el('modeLabel').textContent, '合成演示');
});
