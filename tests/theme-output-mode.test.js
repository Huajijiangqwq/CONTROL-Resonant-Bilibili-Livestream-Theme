'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const fs = require('node:fs'), path = require('node:path'), M = require('../app/theme-editor-model'), I = require('../app/theme-instances');
function fixture(search) {
  const classes = new Set(new URLSearchParams(search).has('obs') || new URLSearchParams(search).has('pure') ? ['pure'] : []);
  const style = () => ({ removeProperty(key) { delete this[key === 'aspect-ratio' ? 'aspectRatio' : key]; } });
  const viewport = { style: style() }, scene = { style: style() }, events = {}, resizes = [];
  const root = { dataset: {}, classList: { add(...items) { items.forEach(value => classes.add(value)); }, remove(...items) { items.forEach(value => classes.delete(value)); }, toggle(value, on) { if (on) classes.add(value); else classes.delete(value); }, contains: value => classes.has(value) } };
  const context = vm.createContext({ ThemeEditorModel: M, ThemeInstances: I, location: { search }, URLSearchParams, Event: class { constructor(type) { this.type = type; } },
    document: { documentElement: root, head: { append() {} }, createElement: () => ({}), getElementById: id => id === 'scene' ? scene : viewport, querySelector: () => ({ clientWidth: 1000, clientHeight: 700 }) },
    window: { addEventListener(name, fn) { events[name] = fn; }, dispatchEvent(event) { resizes.push(event.type); } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/theme-output-view.js'), 'utf8'), context);
  return { api: context.ThemeOutput, classes, root, viewport, scene, apply(document) { const value = context.ThemeOutput.apply(document); events['theme-applied']?.(); return value; }, resizes };
}
test('the same published address follows scene to chat to scene without retaining old clipping', () => {
  const f = fixture('?published=theme&obs=1'), doc = M.create('classic'), chat = doc.layers.find(layer => layer.type === 'chat');
  f.api.setMode('scene', ''); f.apply(doc); assert.equal(f.api.mode, 'scene');
  f.api.setMode('chat', chat.id); f.apply(doc);
  assert(f.classes.has('chat-output')); assert(f.classes.has('pure'));
  assert.equal(f.root.dataset.outputWidth, chat.w); assert.equal(f.viewport.style.height, chat.h + 'px');
  doc.layers.push({ ...chat, id: 'other-chat', w: 320, h: 640, x: 400, y: 120 });
  f.api.setMode('chat', 'other-chat'); f.apply(doc);
  assert.equal(f.root.dataset.outputWidth, 320); assert.equal(f.scene.style.transform, 'scale(1) translate(-400px,-120px)');
  f.api.setMode('scene', ''); f.apply(doc);
  assert(!f.classes.has('chat-output')); assert(!f.classes.has('live-theme-output')); assert(f.classes.has('pure'));
  assert.equal(f.root.dataset.outputWidth, '1920'); assert.equal(f.root.dataset.outputHeight, '1080');
  assert.equal(f.viewport.style.height, undefined); assert.equal(f.viewport.style.aspectRatio, undefined); assert.equal(f.scene.style.transform, undefined);
  assert(f.resizes.includes('resize'));
});
test('old output=chat query cannot override a published scene packet; explicit pure stays, implicit pure is restored', () => {
  for (const suffix of ['', '&pure=1']) {
    const f = fixture('?published=theme&output=chat' + suffix);
    assert(f.classes.has('pure'));
    f.api.setMode('scene', ''); f.apply(M.create('classic'));
    assert.equal(f.api.mode, 'scene'); assert(!f.classes.has('chat-output'));
    assert.equal(f.classes.has('pure'), !!suffix);
  }
});
test('static snapshots and editor/library views keep their own URL output contract', () => {
  const snapshot = fixture('?theme=static&output=chat&pure=1');
  assert.equal(snapshot.api.setMode('scene', ''), false); assert.equal(snapshot.api.mode, 'chat');
  const editor = fixture('?editor=1&obs=1&libraryPreview=1');
  assert.equal(editor.api.setMode('chat', 'chat'), false); assert.equal(editor.api.mode, 'scene');
});
