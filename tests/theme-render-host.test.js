'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('../app/theme-editor-model');
const I = require('../app/theme-instances');

function fixture(initial) {
  const frame = () => ({
    style: {}, dataset: {}, isConnected: true, parentNode: null,
    contentWindow: { postMessage() {}, NativeMessageSnapshot: () => ({ messages: [] }) },
    setAttribute() {}, addEventListener() {}, remove() { this.parentNode = null; },
  });
  const host = () => ({
    moves: 0,
    moveBefore(el) { this.moves++; el.parentNode = this; },
    append(el) { el.parentNode = this; },
  });
  const scene = host(), feed = host(), mainFrame = frame();
  mainFrame.parentNode = feed;
  const window = { ThemePanelMask: { create: () => ({ clear() {} }) }, addEventListener() {} };
  const context = vm.createContext({
    window, ThemeInstances: I, ThemeEditorModel: M, structuredClone,
    document: { createElement: frame }, location: { origin: 'http://localhost' },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/theme-instance-runtime.js'), 'utf8'), context);
  let project = initial;
  const nodes = new Map([['chat', { querySelector: () => feed }]]);
  const runtime = window.ThemeInstanceRuntime.create({
    scene, nodes, getProject: () => project, mainFrame,
    drawLayer() {}, paintChatDecorations() {},
  });
  return { scene, feed, mainFrame, runtime, setProject: p => { project = p; } };
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
