'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const fs = require('node:fs'), path = require('node:path'), M = require('../app/theme-editor-model');
const turn = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const elements = new Map(), windowEvents = new Map(), requests = [], dispatches = [], timers = new Set();
  let boot, draft = M.create('classic'), selection = [], serializations = 0;
  const json = { parse: JSON.parse, stringify(...args) { serializations++; return JSON.stringify(...args); } };
  function element(id = '') {
    if (id && elements.has(id)) return elements.get(id);
    const value = { id, value: '', textContent: '', dataset: {}, style: {}, checked: false, disabled: false,
      parentElement: { firstChild: { nodeType: 3, textContent: '' } },
      setAttribute() {}, prepend() {}, append() {}, before() {}, after() {}, replaceChildren() {}, showModal() {}, focus() {}, select() {},
      closest: () => element('intro'), querySelector: selector => element(selector),
    };
    if (id) elements.set(id, value); return value;
  }
  element('publishOutput').value = 'scene';
  const doc = { getElementById: element, createElement: () => {
    const value = element(); let id = '';
    Object.defineProperty(value, 'id', { get: () => id, set: next => { id = next; elements.set(next, value); } }); return value;
  }, createTextNode: value => value, querySelectorAll: () => [] };
  const stream = { events: {}, addEventListener(name, fn) { this.events[name] = fn; }, close() {} };
  const window = {
    ThemeEditor: { get project() { return structuredClone(draft); }, get selection() { return selection; }, themeUrl: () => '' },
    ThemeEditorModel: M, ThemeInstances: require('../app/theme-instances'),
    ThemeDocumentCompare: require('../app/theme-document-compare'),
    StudioEvents: { open: () => stream },
    addEventListener(name, fn) { windowEvents.set(name, fn); }, dispatchEvent(e) { dispatches.push(e); },
    open() {},
  };
  const context = vm.createContext({ window, document: doc, Node: { TEXT_NODE: 3 }, location: { pathname: '/theme-editor.html', href: 'http://localhost:1234/theme-editor.html' },
    URL, crypto: { randomUUID: () => 'writer-this-window' }, JSON: json, Event: class {}, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    localStorage: { setItem() {} }, navigator: { clipboard: { writeText: async () => {} } }, AbortSignal,
    setInterval(fn) { boot = fn; return 1; }, clearInterval() {},
    setTimeout(fn, ms) { const id = setTimeout(fn, ms); timers.add(id); return id; }, clearTimeout,
    fetch(url, options) { return new Promise(resolve => requests.push({ url, body: options?.body && JSON.parse(options.body), resolve: value => resolve({ ok: true, json: async () => value }) })); },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/theme-publish-ui.js'), 'utf8'), context); boot();
  const packet = (revision, writer = 'previous-writer', epoch = 'instance-1') => ({ channel: 'theme', revision, writer, epoch, document: structuredClone(draft), output: 'scene', chatId: '', name: '主题', appliedAt: revision });
  const receive = value => stream.events.published({ data: JSON.stringify(value) });
  receive(packet(1));
  return { window, elements, requests, dispatches, packet, receive, stream, get serializations() { return serializations; }, select(ids) { selection = ids; },
    edit(value) { draft = value; windowEvents.get('theme-document-change')({ detail: { document: draft } }); },
    close() { windowEvents.get('pagehide')(); for (const timer of timers) clearTimeout(timer); },
  };
}
test('late HTTP publication replies cannot rewind a newer live revision or announce an old preference', async t => {
  const f = fixture(); t.after(() => f.close());
  const applying = f.window.ThemePublish.apply(); await turn();
  f.receive(f.packet(3, 'other-editor'));
  f.requests[0].resolve(f.packet(2, 'writer-this-window'));
  assert.equal(await applying, true);
  assert.equal(f.window.ThemePublish.state.revision, 3);
  assert.equal(f.dispatches.filter(e => e.type === 'theme-published').length, 0);
});
test('another editor or disconnection pauses live auto apply, preventing competing draft writers', async t => {
  const f = fixture(); t.after(() => f.close());
  const enable = f.elements.get('publicationAuto').onchange({ target: { checked: true } });
  await turn(); f.requests[0].resolve(f.packet(2, 'writer-this-window')); await enable;
  assert.equal(f.elements.get('publicationAuto').checked, true);
  f.receive(f.packet(3, 'another-editor'));
  assert.equal(f.elements.get('publicationAuto').checked, false);
  assert.match(f.elements.get('publicationState').textContent, /另一个编辑窗口/);
  f.stream.events.error();
  assert.equal(f.elements.get('applyLiveTheme').disabled, true);
  f.receive(f.packet(3, 'another-editor'));
  assert.equal(f.elements.get('applyLiveTheme').disabled, false);
  assert.equal(f.elements.get('publicationAuto').checked, false);
  assert(!f.elements.get('publicationState').textContent.includes('已断开'));
});
test('project-switch pause waits for the current publication and stops automatic following updates', async t => {
  const f = fixture(); t.after(() => f.close());
  const applying = f.elements.get('publicationAuto').onchange({ target: { checked: true } });
  await turn(); let settled = false;
  const pause = f.window.ThemePublish.pause().then(() => { settled = true; });
  await turn(); assert.equal(settled, false);
  f.requests[0].resolve(f.packet(2, 'writer-this-window')); await applying; await pause;
  assert.equal(settled, true); assert.equal(f.elements.get('publicationAuto').checked, false);
});

test('pending OBS geometry is visible outside the collapsed details without blocking a usable theme URL', t => {
  const f = fixture(); t.after(() => f.close());
  f.stream.events['obs-published']({ data: JSON.stringify({ connected: false, targets: [{ id: 'owned', channel: 'theme', sceneName: '主题场景', phase: 'pending', message: '等待连接' }] }) });
  assert.match(f.elements.get('publicationBadge').textContent, /OBS 采集待同步/);
  assert.equal(f.elements.get('publicationBadge').dataset.state, 'pending');
  assert.equal(f.elements.get('copyUrl').disabled, false);
  f.stream.events['obs-published']({ data: JSON.stringify({ connected: true, targets: [{ id: 'owned', channel: 'theme', sceneName: '主题场景', phase: 'synced', message: '已同步' }] }) });
  assert(!f.elements.get('publicationBadge').textContent.includes('待同步'));
});

test('chat-only output follows the initial selection then keeps its explicit target, reporting removal or hidden containers', async t => {
  const f = fixture(); t.after(() => f.close());
  const doc = f.window.ThemeEditor.project, first = doc.layers.find(layer => layer.type === 'chat');
  doc.layers.push({ ...structuredClone(first), id: 'second-chat', name: '第二个弹幕区' });
  f.select(['second-chat']); f.edit(doc);
  f.elements.get('publishOutput').value = 'chat'; f.elements.get('publishOutput').onchange();
  assert.equal(f.elements.get('publicationChatPicker').value, 'second-chat');
  f.select([first.id]); f.edit(doc);
  assert.equal(f.elements.get('publicationChatPicker').value, 'second-chat', 'canvas selection must not silently retarget a pending output');
  const applying = f.window.ThemePublish.apply(); await turn();
  assert.equal(f.requests[0].body.chatId, 'second-chat');
  f.requests[0].resolve({ ...f.packet(2, 'writer-this-window'), output: 'chat', chatId: 'second-chat' }); await applying;
  doc.layers = doc.layers.filter(layer => layer.id !== 'second-chat'); f.edit(doc);
  assert.equal(f.elements.get('applyLiveTheme').disabled, true);
  assert.match(f.elements.get('publicationChatHint').textContent, /已删除/);
  f.elements.get('publicationChatPicker').onchange({ target: { value: first.id } });
  assert.equal(f.elements.get('applyLiveTheme').disabled, false);
  doc.layers.find(layer => layer.id === first.id).visible = false; f.edit(doc);
  assert.equal(f.elements.get('applyLiveTheme').disabled, true);
  assert.match(f.elements.get('publicationChatHint').textContent, /隐藏/);
});

test('sixty 20 MiB draft updates allocate no full-document JSON strings in publication status', t => {
  const f = fixture(); t.after(() => f.close());
  const doc = f.window.ThemeEditor.project;
  doc.layers.unshift({ id: 'large-one', type: 'image', name: 'A', src: 'data:image/png;base64,' + 'a'.repeat(10 * 1024 * 1024) }, { id: 'large-two', type: 'image', name: 'B', src: 'data:image/png;base64,' + 'b'.repeat(10 * 1024 * 1024) });
  f.edit(doc); f.receive({ ...f.packet(2), document: JSON.parse(JSON.stringify(doc)) });
  const before = f.serializations, start = performance.now();
  for (let i = 0; i < 60; i++) { doc.layers.at(-1).x = i; f.edit(doc); }
  assert.equal(f.serializations, before);
  assert.equal(f.window.ThemePublish.dirty, true);
  t.diagnostic('60 publication updates with 20 MiB media: ' + (performance.now() - start).toFixed(1) + ' ms total; no large JSON allocation.');
});
