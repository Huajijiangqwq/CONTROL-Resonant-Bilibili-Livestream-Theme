'use strict';
const test = require('node:test'), assert = require('node:assert/strict'),
  fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'),
  M = require('../app/theme-editor-model'), Motion = require('../app/theme-sync-motion'),
  Layout = require('../app/live-layout-motion'), { FrameGate } = require('../app/frame-rate');
const source = file => fs.readFileSync(path.join(__dirname, '../app/' + file), 'utf8');
function transition(fps, urlFPS, duration = 1000) {
  let callback, wall = 0, receive; const calls = [];
  class Events { addEventListener(kind, fn) { if (kind === 'layout') receive = fn; } close() {} }
  const context = { window: { ThemeRenderer: { active: true, apply(document) { calls.push({ time: wall, document }); } },
    FrameRate: { gate: () => new FrameGate(() => fps) }, addEventListener() {} },
    document: { getElementById: () => ({ dataset: {} }) },
    location: { search: '?live=abcdef123456abcdef123456' + (urlFPS ? '&fps=' + urlFPS : '') },
    URLSearchParams, ThemeSyncMotion: Motion, Date: { now: () => wall }, EventSource: Events,
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {} };
  vm.runInNewContext(source('theme-live-receiver.js'), context);
  const document = M.create('split'), from = Motion.geometry(document);
  from.game.x = -400; document.layers.find(l => l.id === 'game').x = 100;
  receive({ data: JSON.stringify({ revision: 1, document, from, startAt: 0, duration }) });
  for (let i = 0; i <= 120; i++) { wall = i * 1000 / 120; const next = callback; callback = null; next?.(wall); }
  return calls;
}
test('live layout sampling honors configured 30/60/120 fps while preserving elapsed duration', () => {
  for (const fps of [30, 60, 120]) {
    const calls = transition(fps);
    assert.equal(calls.length, fps + 1);
    assert.equal(calls[0].time, 0); assert.equal(calls.at(-1).time, 1000);
    assert.equal(calls.at(-1).document.layers.find(l => l.id === 'game').x, 100);
  }
  assert.equal(transition(30, 60).length, 61, 'explicit output fps overrides the local setting');
});
test('a low fps gate still paints the final layout instead of stopping between endpoints', () => {
  const calls = transition(5, undefined, 981);
  assert(calls.at(-1).time >= 981 && calls.at(-1).time < 990);
  assert.equal(calls.at(-1).document.layers.find(l => l.id === 'game').x, 100);
});
test('layout exit, move and entrance phase boundaries remain continuous at different frame rates', () => {
  for (const from of ['classic', 'game', 'split', 'custom']) {
    const plan = Layout.plan(from, 'split');
    for (const boundary of [plan.exit, plan.exit + plan.move, plan.total]) {
      const before = Layout.sample(plan, boundary - .001), after = Layout.sample(plan, boundary + .001);
      assert(Math.abs(before.geometry - after.geometry) < 1e-6);
      assert(Math.abs(before.visibility - after.visibility) < 1e-6);
    }
    for (const fps of [30, 60]) {
      const frames = Array.from({ length: Math.ceil(plan.total * fps / 1000) + 1 }, (_, i) => Layout.sample(plan, i * 1000 / fps));
      assert.equal(frames.at(-1).done, true); assert.equal(frames.at(-1).visibility, 1);
    }
  }
});
test('same-size message presentation preserves canvas storage, resized view still updates layout and CSS', () => {
  const text = source('simulation.js'), begin = text.indexOf('  function resize() {'), end = text.indexOf('  function releaseAllowance()', begin);
  let writes = 0;
  const canvas = { get width() { return this.w; }, set width(v) { this.w = v; writes++; },
    get height() { return this.h; }, set height(v) { this.h = v; writes++; } }, shell = { style: {} },
    chat = { w: 458, h: 908, paddingTop: 102, paddingBottom: 12 },
    context = vm.createContext({ combinedChat: () => true, activeZone: false, component: () => chat,
      layout: {}, canvas, $: () => shell, Math });
  vm.runInContext(text.slice(begin, end), context);
  for (let i = 0; i < 60; i++) context.resize();
  assert.equal(writes, 2); assert.equal(shell.style.width, '570px'); assert.equal(context.viewHeight, 794);
  chat.w = 600; chat.paddingTop = 140; context.resize();
  assert.equal(writes, 4); assert.equal(shell.style.width, '712px'); assert.equal(context.layout.width, 600);
  assert.equal(context.viewHeight, 756); assert.equal(canvas.height, 1134);
});
