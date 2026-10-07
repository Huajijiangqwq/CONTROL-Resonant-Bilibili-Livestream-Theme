'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), crypto = require('node:crypto');
const fs = require('node:fs'), path = require('node:path'), Merge = require('../app/theme-document-merge');
const turn = () => new Promise(resolve => setImmediate(resolve));
const code = fs.readFileSync(path.join(__dirname, '../app/theme-editor-sync.js'), 'utf8');
const document = () => ({ format: 'control-theme', version: 1, name: '同一主题', layers: [{ id: 'one', type: 'text', x: 10, y: 20, text: '原文字' }] });
function fixture(t) {
  let current = { format: 'control-editor-draft', epoch: 'original-epoch', revision: 1, document: document() }, read = null, safety = 0, deliver = true, beforeCommit = null;
  let reads = 0, commits = 0;
  const recovery = [], channels = new Set(), views = [];
  class Channel {
    constructor() { this.events = {}; channels.add(this); }
    addEventListener(name, fn) { this.events[name] = fn; }
    postMessage(value) { if (deliver) for (const other of channels) if (other !== this) queueMicrotask(() => other.events.message?.({ data: value })); }
    close() { channels.delete(this); }
  }
  const store = {
    draft: async () => { reads++; return read ? read() : { ...structuredClone(current), safety }; },
    bumpSafety: async () => ++safety,
    put: async (key, value) => recovery.push({ key, value: structuredClone(value) }),
    commitDraft: async (_key, value, revision, writer, epoch) => {
      commits++; if (beforeCommit) await beforeCommit();
      if ((current?.revision || 0) !== revision || (epoch && current?.epoch && epoch !== current.epoch)) return { ok: false, current: structuredClone(current) };
      current = { format: 'control-editor-draft', epoch: current?.epoch || 'new-epoch', revision: revision + 1, writer, safety, document: structuredClone(value) };
      return { ok: true, current: structuredClone(current) };
    },
  };
  function view(initial = structuredClone(current)) {
    let value = structuredClone(initial.document), busy = false;
    const statuses = [], conflicts = [], applied = [], events = {}, order = [];
    const window = { addEventListener(name, fn) { events[name] = fn; }, removeEventListener(name) { delete events[name]; }, dispatchEvent(event) { order.push(event.type); events[event.type]?.(event); } };
    vm.runInNewContext(code, { window, ThemeEditorStorage: store, ThemeDocumentMerge: Merge, crypto: crypto.webcrypto, BroadcastChannel: Channel, structuredClone, queueMicrotask, setTimeout, clearTimeout, Date, Event: class { constructor(type) { this.type = type; } } });
    const sync = window.ThemeEditorSync.create({ key: 'draft', initial, base: structuredClone(value), get: () => value, apply: next => { order.push('apply'); value = structuredClone(next); applied.push(value); }, status: text => statuses.push(text), conflict: values => conflicts.push(values), busy: () => busy });
    const result = { sync, statuses, conflicts, applied, events, order, get value() { return value; }, set busy(next) { busy = next; } };
    views.push(result); return result;
  }
  t.after(() => views.forEach(value => value.sync.close()));
  return { view, recovery, store, get counts() { return { reads, commits }; }, get current() { return current; }, set current(value) { current = structuredClone(value); }, set read(value) { read = value; }, set deliver(value) { deliver = value; }, set beforeCommit(value) { beforeCommit = value; } };
}
test('a cached editor catches a commit missed between its initial read and channel subscription', async t => {
  const f = fixture(t), old = structuredClone(f.current), updated = structuredClone(old);
  updated.revision = 2; updated.document.layers[0].x = 333; f.current = updated;
  const page = f.view(old); await turn(); await page.sync.refresh();
  assert.equal(page.value.layers[0].x, 333);
  assert.equal(page.sync.revision, 2);
});
test('delayed storage reads merge with the newest local input instead of replacing it', async t => {
  const f = fixture(t), page = f.view(); await turn();
  const remote = structuredClone(f.current); remote.revision = 2; remote.document.layers[0].y = 444; f.current = remote;
  let release;
  f.read = () => new Promise(resolve => { release = () => resolve(structuredClone(remote)); });
  const refreshing = page.sync.refresh(); await turn();
  page.value.layers[0].text = '读取期间继续输入';
  f.read = null; release(); await refreshing;
  assert.equal(page.value.layers[0].y, 444); assert.equal(page.value.layers[0].text, '读取期间继续输入');
  assert.equal(f.current.document.layers[0].text, '读取期间继续输入');
});
test('remote changes wait through a gesture or text edit and preserve a recovery copy', async t => {
  const f = fixture(t), page = f.view(); await turn();
  page.busy = true; page.value.layers[0].text = '未失焦的文字';
  const remote = structuredClone(f.current); remote.revision++; remote.document.layers[0].y = 777; f.current = remote;
  assert.equal(await page.sync.refresh(), false);
  assert.equal(page.applied.length, 0);
  assert(f.recovery.some(value => value.value.project.layers[0].text === '未失焦的文字'));
  page.busy = false; assert.equal(await page.sync.refresh(), true);
  assert.equal(page.value.layers[0].y, 777); assert.equal(page.value.layers[0].text, '未失焦的文字');
});
test('same-property changes conflict explicitly; neither cached editor silently wins', async t => {
  const f = fixture(t), one = f.view(), two = f.view(); await turn();
  one.value.layers[0].text = '第一页'; two.value.layers[0].text = '第二页';
  await one.sync.save(); await turn();
  assert.equal(await two.sync.save(), false); assert.equal(two.sync.blocked, true);
  assert(f.recovery.some(value => value.value.project.layers[0].text === '第二页'));
  await two.sync.resolve('local'); await turn();
  assert.equal(f.current.document.layers[0].text, '第二页');
  assert.equal(one.value.layers[0].text, '第二页');
});
test('a rebuilt draft epoch is detected even if its revision is lower, retaining both versions', async t => {
  const f = fixture(t); f.current = { ...f.current, revision: 9 };
  const page = f.view(); await turn(); page.value.layers[0].text = '尚未保存';
  const replacement = { ...structuredClone(f.current), epoch: 'replacement-epoch', revision: 1 };
  replacement.document.layers[0].text = '重建后的草稿'; f.current = replacement;
  assert.equal(await page.sync.refresh(), false); assert.equal(page.sync.blocked, true);
  assert(f.recovery.some(value => value.value.project.layers[0].text === '尚未保存'));
  assert(f.recovery.some(value => value.value.project.layers[0].text === '重建后的草稿'));
  await page.sync.resolve('remote');
  assert.equal(page.value.layers[0].text, '重建后的草稿'); assert.equal(page.sync.epoch, 'replacement-epoch');
});

test('a suspended cached editor observes the persisted live-safety generation before applying another project', async t => {
  const f = fixture(t), one = f.view(), hidden = f.view(); await turn();
  f.deliver = false;
  await one.sync.announceSwitch();
  one.value.name = '打开另一个项目'; one.value.layers[0].text = '新项目内容'; await one.sync.save();
  assert.equal(hidden.order.length, 0);
  await hidden.sync.refresh();
  assert.equal(hidden.order[0], 'theme-document-switch');
  assert.equal(hidden.order[1], 'apply');
  assert.equal(hidden.value.name, '打开另一个项目');
});
test('a commit racing a project-switch barrier pauses its live writer even if the pause broadcast was missed', async t => {
  const f = fixture(t), page = f.view(); await turn();
  let release; f.beforeCommit = () => new Promise(resolve => { release = resolve; });
  page.value.layers[0].x = 90; const saving = page.sync.save(); await turn();
  await f.store.bumpSafety(); f.beforeCommit = null; release(); await saving;
  assert(page.order.includes('theme-document-switch'));
});
test('one hundred rapid saves with embedded media coalesce instead of building an IndexedDB queue', async t => {
  const f = fixture(t), doc = structuredClone(f.current);
  doc.document.layers.push({ id: 'image', type: 'image', src: 'data:image/png;base64,' + 'a'.repeat(2 * 1024 * 1024) }); f.current = doc;
  const page = f.view(); await turn(); const before = f.counts;
  const work = [];
  for (let i = 1; i <= 100; i++) { page.value.layers[0].x = i; work.push(page.sync.save()); }
  await Promise.all(work);
  assert.equal(f.current.document.layers[0].x, 100);
  assert(f.counts.reads - before.reads <= 3);
  assert(f.counts.commits - before.commits <= 2);
});

test('conflict resolution checks the persisted safety barrier before applying its chosen document', async t => {
  const f = fixture(t), page = f.view(); await turn();
  page.value.layers[0].text = '本页冲突';
  const remote = structuredClone(f.current); remote.revision = 2; remote.document.layers[0].text = '远端冲突'; f.current = remote;
  assert.equal(await page.sync.refresh(), false);
  await f.store.bumpSafety();
  await page.sync.resolve('remote');
  assert.equal(page.order[0], 'theme-document-switch');
  assert.equal(page.order[1], 'apply');
  assert.equal(page.value.layers[0].text, '远端冲突');
});
