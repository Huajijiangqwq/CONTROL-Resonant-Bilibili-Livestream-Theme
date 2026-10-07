'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('../app/theme-editor-model');
const I = require('../app/theme-instances');

function fixture(initial) {
  const frames = [], handlers = new Map();
  const frame = () => {
    const messages = [];
    const value = {
    style: {}, dataset: {}, isConnected: true, parentNode: null,
    contentWindow: { postMessage(value) { messages.push(value); }, NativeMessageSnapshot: () => ({ messages: [] }) },
    messages,
    setAttribute() {}, addEventListener() {}, remove() { this.parentNode = null; },
    }; frames.push(value); return value;
  };
  const host = () => ({
    moves: 0,
    moveBefore(el) { this.moves++; el.parentNode = this; },
    append(el) { el.parentNode = this; },
  });
  const scene = host(), feed = host(), mainFrame = frame();
  mainFrame.parentNode = feed;
  const window = { ThemePanelMask: { create: () => ({ clear() {} }) }, addEventListener(kind, fn) { handlers.set(kind, fn); } };
  const context = vm.createContext({
    window, ThemeInstances: I, ThemeEditorModel: M, ThemeDocumentCompare: require('../app/theme-document-compare'), structuredClone,
    document: { createElement: frame }, location: { origin: 'http://localhost' },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/theme-instance-runtime.js'), 'utf8'), context);
  let project = initial;
  const nodes = new Map([['chat', { querySelector: () => feed }]]);
  const runtime = window.ThemeInstanceRuntime.create({
    scene, nodes, getProject: () => project, mainFrame,
    drawLayer() {}, paintChatDecorations() {},
  });
  return { scene, feed, mainFrame, runtime, frames,
    ready(frame, instance = 'first') { handlers.get('message')?.({ origin: 'http://localhost', source: frame.contentWindow,
      data: { channel: 'hiss-main-reply', type: 'ready', instance } }); },
    setProject: p => { project = p; } };
}

test('full-screen message renderer stays outside the hidden chat panel', () => {
  const f = fixture(M.create('split'));
  const document = f.mainFrame.contentWindow;
  f.runtime.sync();
  assert.equal(f.mainFrame.parentNode, f.scene);
  assert.equal(f.mainFrame.style.width, '1920px');
  assert.equal(f.mainFrame.style.height, '1080px');
  assert.equal(f.mainFrame.style.opacity, '0');
  assert.equal(f.mainFrame.style.pointerEvents, 'none');
  assert.equal(f.mainFrame.style.left, '0px');
  f.runtime.sync();
  assert.equal(f.scene.moves, 1, 'ordinary property edits must not reload the renderer');
  assert.equal(f.mainFrame.contentWindow, document);
});

test('switching back to a combined feed restores the same renderer and scrolling', () => {
  const f = fixture(M.create('split'));
  f.runtime.sync();
  const document = f.mainFrame.contentWindow;
  const classic = M.create('classic');
  f.setProject(classic);
  f.runtime.sync();
  assert.equal(f.mainFrame.parentNode, f.feed);
  assert.equal(f.mainFrame.style.opacity, '1');
  assert.equal(f.mainFrame.style.pointerEvents, '');
  assert.equal(f.mainFrame.style.width, classic.layers.find(l => l.type === 'chat').w + 112 + 'px');
  assert.equal(f.mainFrame.contentWindow, document);
  f.setProject(M.create('split'));
  f.runtime.sync();
  assert.equal(f.mainFrame.parentNode, f.scene);
  assert.equal(f.mainFrame.contentWindow, document);
});
test('independent message views only receive changed presentation but always receive fresh-ready configuration', () => {
  const doc = M.create('split'), original = doc.layers.find(l => l.type === 'normal');
  doc.layers.push({ ...original, id: 'normal-copy', standalone: true });
  const f = fixture(doc); f.runtime.sync(); const extra = f.frames[1];
  f.ready(extra);
  const count = command => extra.messages.filter(m => m.command === command).length;
  assert.equal(count('presentation'), 1); assert.equal(count('fleet-effects'), 1);
  for (let i = 0; i < 60; i++) f.runtime.sync();
  assert.equal(count('presentation'), 1, 'unrelated renderer ticks must not reset layout');
  const unrelated = M.normalize({ ...doc, name: 'changed document title' });
  f.setProject(unrelated); f.runtime.sync(); assert.equal(count('presentation'), 1);
  unrelated.layers.find(l => l.id === 'normal-copy').fontSize = 39;
  f.setProject(M.normalize(unrelated)); f.runtime.sync(); assert.equal(count('presentation'), 2);
  f.ready(extra, 'reloaded');
  assert.equal(count('presentation'), 3); assert.equal(count('fleet-effects'), 2);
});

test('returning from inspection clears a pending demo in a not-yet-ready independent view', () => {
  const doc = M.create('split'), original = doc.layers.find(l => l.type === 'normal');
  doc.layers.push({ ...original, id: 'normal-copy', standalone: true });
  const f = fixture(doc); f.runtime.sync(); const extra = f.frames[1];
  f.runtime.preview('editor-demo');
  f.runtime.broadcast('clear');
  f.runtime.broadcast('restore', [{ kind: 'normal', sender: 'real', body: 'latest', restored: true }]);
  f.ready(extra);
  assert.equal(extra.messages.filter(m => m.command === 'editor-demo').length, 0);
  assert.equal(extra.messages.filter(m => m.command === 'restore').length, 1);
});
