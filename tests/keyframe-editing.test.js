'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'),
  path = require('node:path'), vm = require('node:vm'), K = require('../app/theme-keyframes');
test('key identities survive time reordering, retiming, JSON roundtrips and malformed duplicates', () => {
  const original = K.normalize([{ property: 'x', keys: [{ time: 0, value: 10 }, { time: 1000, value: 20 }] }])[0];
  const first = original.keys[0].id, last = original.keys[1].id;
  original.keys[0].time = 2000;
  const sorted = K.normalize([original])[0];
  assert.equal(sorted.keys[0].id, last); assert.equal(sorted.keys[1].id, first);
  const copied = K.normalize(JSON.parse(JSON.stringify([K.retime(sorted, 300, 1500)])))[0];
  assert.deepEqual(copied.keys.map(k => k.id), [last, first]);
  assert.deepEqual(K.normalize([copied])[0], copied);
  const fixed = K.normalize([{ property: 'x', keys: [{ id: 'same', time: 0, value: 1 }, { id: 'same', time: 40, value: 2 }] }])[0];
  assert.equal(new Set(fixed.keys.map(k => k.id)).size, 2);
});
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.style = {}; this.events = {}; this.isConnected = true; this.namespaceURI = 'svg'; this._value = ''; this.className = ''; this.classList = { add: (...names) => { this.className += ' ' + names.join(' '); } }; }
  set value(v) { this._value = String(v); } get value() { return this._value; }
  append(...nodes) { for (const node of nodes) { if (typeof node === 'object') { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(n => n !== node); node.parentNode = this; } this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value); }
  addEventListener(key, fn) { this.events[key] = fn; }
  getScreenCTM() { return { inverse: () => ({}) }; }
  setPointerCapture() {}
  contains(node) { return this === node || this.children.some(c => typeof c === 'object' && c.contains(node)); }
  all() { return [this, ...this.children.flatMap(c => typeof c === 'object' ? c.all() : [])]; }
  querySelector(selector) { return this.all().find(n => selector[0] === '.' && n.className.split(' ').includes(selector.slice(1))) || null; }
}
test('editing a key time keeps the following field clickable and edits/deletes the intended key after sorting', () => {
  let owner = { tracks: K.normalize([{ property: 'x', keys: [{ id: 'first', time: 0, value: 10 }, { id: 'last', time: 1000, value: 20 }] }]) }, changes = 0;
  const document = { activeElement: null, createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag) }, window = { addEventListener() {} },
    context = { document, window, ThemeKeyframes: K, ThemeTrackClipboard: { mount() {} },
      ThemeSegmentCurve: { mount() {}, activate() {} }, structuredClone, queueMicrotask: fn => fn(),
      DOMPoint: class { constructor(x, y) { this.x = x; this.y = y; } matrixTransform() { return this; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/theme-track-editor.js'), 'utf8'), context);
  const root = new Node('main'), normalize = fn => { fn(owner); owner.tracks = K.normalize(owner.tracks); };
  const endings = [];
  window.ThemeTrackEditor.mount(root, { owner: () => owner, properties: ['x'], time: () => 0,
    seek() {}, start() {}, play() {}, change(fn) { changes++; normalize(fn); }, live: normalize,
    end(options) { endings.push(options); } });
  const find = label => root.all().find(n => n.attributes['aria-label'] === label),
    time = find('X 偏移第 1 帧时间毫秒'), value = find('X 偏移第 1 帧值'), remove = find('删除X 偏移第 1 帧');
  document.activeElement = time; time.value = '1500'; time.onchange();
  assert.equal(changes, 0, 'time blur must not rebuild and remove the next button');
  assert.equal(owner.tracks[0].keys[1].id, 'first');
  document.activeElement = value; value.value = '75'; value.oninput(); value.onchange();
  assert.equal(owner.tracks[0].keys.find(k => k.id === 'first').value, 75);
  assert.equal(owner.tracks[0].keys.find(k => k.id === 'last').value, 20);
  remove.onclick();
  assert.equal(owner.tracks[0].keys.length, 1); assert.equal(owner.tracks[0].keys[0].id, 'last');
  assert(endings.every(o => o.fields === false));
  const plot = root.querySelector('.track-graph'), dot = plot.children.find(n => n.tagName === 'CIRCLE');
  dot.onpointerdown({ clientX: 40, clientY: 60, pointerId: 1, preventDefault() {} });
  assert.equal(window.ThemeTrackEditor.isInteracting, true);
  plot.onlostpointercapture(); assert.equal(window.ThemeTrackEditor.isInteracting, false);
  dot.onpointerdown({ clientX: 40, clientY: 60, pointerId: 1, preventDefault() {} });
  plot.isConnected = false; assert.equal(window.ThemeTrackEditor.isInteracting, false);
});
