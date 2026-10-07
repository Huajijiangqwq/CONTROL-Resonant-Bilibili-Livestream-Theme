'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), M = require('../app/theme-editor-model'), C = require('../app/theme-layer-clipboard'), I = require('../app/theme-instances');
const ids = prefix => { let next = 0; return () => prefix + '-' + ++next; };
test('cross-project clipboard preserves groups, relative geometry, media crop and effects with remapped IDs', () => {
  const original = M.normalize({ layers: [
    { id: 'g', type: 'group', name: '品牌', opacity: .6 },
    { id: 'photo', type: 'image', parent: 'g', x: -120, y: 300, w: 500, h: 280,
      src: 'assets/game-placeholder.svg', cropLeft: 20, cropTop: 15, effects: [{ id: 'fx', type: 'blur', value: 8 }] },
    { id: 'text', type: 'text', parent: 'g', x: 600, y: 320, text: '测试字幕' },
  ], settings: { sessdata: 'private-not-copied', hostInput: 'not-layer-data' } });
  const text = C.encode(original, ['g']);
  assert(!text.includes('private-not-copied')); assert(!text.includes('hostInput'));
  const result = C.paste(M.normalize(), text, { id: ids('pasted') }),
    group = result.items.find(l => l.type === 'group'), photo = result.items.find(l => l.type === 'image'),
    title = result.items.find(l => l.type === 'text');
  assert.equal(photo.parent, group.id); assert.equal(title.parent, group.id);
  assert.equal(title.x - photo.x, 720); assert.equal(title.y - photo.y, 20);
  assert.equal(photo.cropLeft, 20); assert.equal(photo.cropTop, 15);
  assert.deepEqual(photo.effects, original.layers.find(l => l.id === 'photo').effects);
  assert.equal(photo.src, 'assets/game-placeholder.svg'); assert.deepEqual(result.selection, [group.id]);
  assert(result.items.every(l => !original.layers.some(o => o.id === l.id)));
});
test('copying a combined chat also copies its owned message templates and remaps their owner', () => {
  const original = M.create('classic'), result = C.paste(M.normalize(), C.encode(original, ['chat']), { id: ids('chat-paste') });
  const chat = result.items.find(l => l.type === 'chat'); assert(chat);
  for (const kind of ['normal', 'sc', 'gift', 'fleet']) {
    const layer = result.items.find(l => l.type === kind); assert(layer); assert.equal(layer.chatId, chat.id);
  }
});
test('clipboard rejects foreign formats, dangerous URLs, oversized documents and ID collisions', () => {
  assert.throws(() => C.decode('not a project'));
  assert.throws(() => C.decode(JSON.stringify(M.create('classic'))));
  const doc = M.normalize({ layers: [{ id: 'photo', type: 'image', src: 'assets/game-placeholder.svg' }] });
  const text = C.encode(doc, ['photo']), unsafe = JSON.parse(text);
  unsafe.document.layers[0].src = 'javascript:alert(1)';
  assert.throws(() => C.decode(JSON.stringify(unsafe)), /素材/);
  assert.throws(() => C.decode(' '.repeat(C.maxBytes + 1)), /16 MB/);
  const full = M.normalize({ layers: Array.from({ length: 100 }, (_, i) => ({ id: 'existing-' + i, type: 'text' })) });
  assert.throws(() => C.paste(full, text, { id: ids('overflow') }), /100/);
  assert.throws(() => C.paste(doc, text, { id: () => 'photo' }), /编号冲突/);
});
test('a combined chat pasted into full-screen layers remains an independent feed without swallowing existing lanes', () => {
  const source = M.create('classic'), target = M.create('split'),
    pasted = C.paste(target, C.encode(source, ['chat']), { id: ids('independent') }),
    document = M.normalize({ ...target, layers: [...target.layers, ...pasted.items] }),
    chat = document.layers.find(l => l.type === 'chat');
  assert.equal(document.composition, 'layers'); assert.equal(chat.standalone, true);
  assert.equal(I.primaryChat(document), undefined);
  const main = I.project(document), feed = I.project(document, chat.id);
  for (const kind of I.kinds) {
    const original = target.layers.find(l => l.type === kind),
      pastedLayer = pasted.items.find(l => l.type === kind);
    assert.equal(main.layers.find(l => l.type === kind).id, original.id);
    assert.equal(main.layers.find(l => l.id === original.id).x, original.x);
    assert(I.feed(document, pastedLayer));
    assert.equal(feed.layers.find(l => l.type === kind).id, pastedLayer.id);
  }
  assert.equal(feed.composition, 'feed'); assert.equal(I.primaryChat(feed).id, chat.id);
  assert.equal(I.primaryChat(feed).standalone, false);
  assert.deepEqual(I.targets(document).map(l => l.id), [chat.id]);
  assert.equal(I.targets(feed).length, 0, 'a scoped feed must not recursively create another view');
  const reloaded = M.normalize(JSON.parse(JSON.stringify(document)));
  assert.equal(reloaded.layers.find(l => l.id === chat.id).standalone, true);
});
