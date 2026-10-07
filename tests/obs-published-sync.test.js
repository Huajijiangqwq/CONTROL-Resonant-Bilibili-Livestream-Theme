'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const M = require('../app/theme-editor-model'), FakeObs = require('./fixtures/fake-obs');
const { createObsBridge } = require('../app/obs-bridge'), { createThemePublish } = require('../app/theme-publish-server');
const origin = 'http://127.0.0.1:19031';
function fixture(t, Fake = FakeObs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-managed-obs-')), fake = new Fake();
  const publication = createThemePublish({ dataRoot: root, model: () => M });
  const bridge = createObsBridge({ root, connection: fake, model: () => M, publication });
  t.after(async () => { await bridge.managed.settled(); bridge.close(); publication.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, fake, publication, bridge };
}
test('one-click scenes use the applied checkpoint; draft edits stay local and a new application aligns captures', async t => {
  const f = fixture(t), doc = M.create('classic');
  await assert.rejects(f.bridge.install({ published: 'theme', source: '游戏源' }, origin), error => error.code === 'APPLY_FIRST');
  f.publication.publish('theme', { document: doc, revision: 0 });
  const created = await f.bridge.install({ published: 'theme', source: '游戏源', document: { invalid: 'ignored' } }, origin);
  assert(created.url.includes('published=theme')); assert(!created.url.includes('theme='));
  const storedUrl = f.fake.settings[created.inputName].url;
  const capture = () => f.fake.items[created.sceneName].find(item => item.sourceName === '游戏源');
  const game = doc.layers.find(layer => layer.type === 'game'), before = capture().sceneItemTransform.positionX;
  game.x = 300; game.y = 100; game.w = 960; game.h = 540; game.rotation = 15;
  assert.equal(capture().sceneItemTransform.positionX, before, 'unapplied draft never touches OBS');
  f.publication.publish('theme', { document: doc, revision: 1 }); await f.bridge.managed.settled();
  const state = f.bridge.managed.state('theme').targets[0];
  assert.equal(state.revision, 2); assert.equal(state.phase, 'synced');
  assert.equal(capture().sceneItemTransform.rotation, f.publication.snapshot('theme').document.layers.find(layer => layer.type === 'game').rotation);
  assert.equal(capture().sceneItemTransform.boundsWidth, 1280);
  assert.equal(f.fake.settings[created.inputName].url, storedUrl, 'updates do not replace or reload browser URL');
  assert(!f.fake.calls.some(call => /^(SetCurrentProgramScene|StartRecord|StopRecord|StartStream|StopStream)$/.test(call.type)));
});
test('disconnected OBS and another collection do not block publication; reconnect applies the newest revision', async t => {
  const f = fixture(t), doc = M.create('classic');
  f.publication.publish('theme', { document: doc, revision: 0 });
  const created = await f.bridge.install({ published: 'theme', source: '游戏源' }, origin);
  f.fake.phase = 'idle'; await f.bridge.managed.poll();
  doc.layers.find(layer => layer.type === 'game').x = 250;
  f.publication.publish('theme', { document: doc, revision: 1 }); await f.bridge.managed.settled();
  assert.equal(f.publication.snapshot('theme').revision, 2);
  assert.equal(f.bridge.managed.state().targets[0].phase, 'pending');
  doc.layers.find(layer => layer.type === 'game').x = 400;
  f.publication.publish('theme', { document: doc, revision: 2 });
  f.fake.phase = 'connected'; await f.bridge.managed.poll(); await f.bridge.managed.settled();
  assert.equal(f.bridge.managed.state().targets[0].revision, 3);
  const gameItem = f.fake.items[created.sceneName].find(item => item.sourceName === '游戏源');
  assert(Math.abs(gameItem.sceneItemTransform.positionX - 400 * 4 / 3) < 0.01);
  f.fake.collection = '别的集合'; await f.bridge.managed.poll();
  assert.equal(f.bridge.managed.state().targets[0].phase, 'collection');
  f.fake.collection = '测试集合'; await f.bridge.managed.poll();
  assert.equal(f.bridge.managed.state().targets[0].phase, 'synced');
});
test('management never overwrites a changed source and its ownership survives service restart', async t => {
  const f = fixture(t), doc = M.create('classic');
  f.publication.publish('theme', { document: doc, revision: 0 });
  const created = await f.bridge.install({ published: 'theme', source: '游戏源' }, origin);
  const id = f.bridge.managed.state().targets[0].id;
  f.fake.settings[created.inputName].url = 'https://example.org/user-changed';
  doc.layers.find(layer => layer.type === 'game').x = 600;
  f.publication.publish('theme', { document: doc, revision: 1 }); await f.bridge.managed.settled();
  assert.equal(f.bridge.managed.state().targets[0].phase, 'error');
  assert.equal(f.fake.settings[created.inputName].url, 'https://example.org/user-changed');
  const { createPublishedSync } = require('../app/obs-published-sync');
  const restored = createPublishedSync({ root: f.root, connection: f.fake, publication: f.publication, model: () => M });
  try { assert.equal(restored.state().targets[0].id, id); await restored.forget(id); assert.equal(restored.state().targets.length, 0); assert(f.fake.scenes.some(scene => scene.sceneName === created.sceneName)); }
  finally { restored.close(); }
});

test('rapid applications settle at the newest geometry and preserve unrelated scene items', async t => {
  const f = fixture(t), doc = M.create('classic');
  f.publication.publish('theme', { document: doc, revision: 0 });
  const created = await f.bridge.install({ published: 'theme', source: '游戏源' }, origin);
  const unrelated = { sceneItemId: 99999, sourceName: '用户添加的摄像头', sceneItemTransform: { positionX: 42 } };
  f.fake.items[created.sceneName].push(unrelated);
  for (let revision = 1; revision <= 5; revision++) {
    doc.layers.find(layer => layer.type === 'game').x = revision * 100;
    f.publication.publish('theme', { document: doc, revision });
  }
  await f.bridge.managed.settled();
  assert.equal(f.bridge.managed.state().targets[0].revision, 6);
  assert.equal(unrelated.sceneItemTransform.positionX, 42);
  assert(f.fake.items[created.sceneName].includes(unrelated));
  assert(!f.fake.calls.some(call => call.d?.sceneItemId === 99999));
  assert(!f.fake.calls.some(call => call.type === 'SetSceneItemIndex' && call.d.sceneItemId === f.fake.items[created.sceneName].find(item => item.sourceName === created.inputName).sceneItemId), 'applying must not move a user camera below the theme');
});

class UuidObs extends FakeObs {
  constructor() { super(); this.serial = 0; this.inputs[0].inputUuid = 'game-source-uuid'; }
  async call(type, raw = {}) {
    const data = { ...raw };
    if (data.sceneUuid) {
      const scene = this.scenes.find(value => value.sceneUuid === data.sceneUuid);
      if (!scene) throw Error('scene missing');
      data.sceneName = scene.sceneName; delete data.sceneUuid;
    }
    if (data.inputUuid) {
      const input = this.inputs.find(value => value.inputUuid === data.inputUuid);
      if (!input) throw Error('input missing');
      data.inputName = input.inputName; delete data.inputUuid;
    }
    const result = await super.call(type, data);
    if (type === 'CreateScene') { const uuid = 'scene-uuid-' + ++this.serial; this.scenes.find(value => value.sceneName === data.sceneName).sceneUuid = uuid; result.sceneUuid = uuid; }
    if (type === 'CreateInput') { const uuid = 'input-uuid-' + ++this.serial; this.inputs.find(value => value.inputName === data.inputName).inputUuid = uuid; result.inputUuid = uuid; }
    return result;
  }
  renameScene(oldName, name) { this.scenes.find(value => value.sceneName === oldName).sceneName = name; this.items[name] = this.items[oldName]; delete this.items[oldName]; }
  renameInput(oldName, name) {
    this.inputs.find(value => value.inputName === oldName).inputName = name;
    if (this.settings[oldName]) { this.settings[name] = this.settings[oldName]; delete this.settings[oldName]; }
    for (const items of Object.values(this.items)) for (const item of items) if (item.sourceName === oldName) item.sourceName = name;
  }
}
test('managed OBS identities survive renaming without taking over a same-name replacement', async t => {
  const f = fixture(t, UuidObs), doc = M.create('classic');
  f.publication.publish('theme', { document: doc, revision: 0 });
  const created = await f.bridge.install({ published: 'theme', source: '游戏源' }, origin);
  f.fake.renameScene(created.sceneName, '我的主题场景');
  f.fake.renameInput(created.inputName, '主题叠加');
  f.fake.renameInput('游戏源', '游戏采集改名');
  doc.layers.find(layer => layer.type === 'game').x = 200;
  f.publication.publish('theme', { document: doc, revision: 1 }); await f.bridge.managed.settled();
  assert.equal(f.bridge.managed.state().targets[0].phase, 'synced');
  assert.equal(f.bridge.managed.state().targets[0].sceneName, '我的主题场景');
  assert.equal(f.bridge.managed.state().targets[0].inputName, '主题叠加');
  f.fake.scenes.find(value => value.sceneName === '我的主题场景').sceneUuid = 'different-new-scene';
  const before = f.fake.calls.length;
  f.publication.publish('theme', { document: doc, revision: 2 }); await f.bridge.managed.settled();
  assert.equal(f.bridge.managed.state().targets[0].phase, 'error');
  assert(!f.fake.calls.slice(before).some(call => call.type.startsWith('Set') || call.type.startsWith('Remove')));
});

test('one removed managed scene does not block another; forgetting a binding never deletes OBS items', async t => {
  const f = fixture(t), doc = M.create('classic');
  f.publication.publish('theme', { document: doc, revision: 0 });
  const first = await f.bridge.install({ published: 'theme', source: '游戏源' }, origin);
  doc.name = '第二个受管场景'; f.publication.publish('theme', { document: doc, revision: 1 }); await f.bridge.managed.settled();
  const second = await f.bridge.install({ published: 'theme', source: '游戏源' }, origin);
  f.fake.scenes = f.fake.scenes.filter(scene => scene.sceneName !== first.sceneName); delete f.fake.items[first.sceneName];
  doc.layers.find(layer => layer.type === 'game').x = 777;
  f.publication.publish('theme', { document: doc, revision: 2 }); await f.bridge.managed.settled();
  const rows = f.bridge.managed.state().targets;
  assert.equal(rows.find(row => row.sceneName === first.sceneName).phase, 'error');
  assert.equal(rows.find(row => row.sceneName === second.sceneName).revision, 3);
  const retained = f.fake.items[second.sceneName].map(item => item.sceneItemId), before = f.fake.calls.length;
  await f.bridge.managed.forget(rows.find(row => row.sceneName === second.sceneName).id);
  assert.deepEqual(f.fake.items[second.sceneName].map(item => item.sceneItemId), retained);
  assert(!f.fake.calls.slice(before).some(call => call.type.startsWith('Remove')));
});

test('text-only applications avoid redundant OBS transforms, but manual capture drift is corrected', async t => {
  const f = fixture(t), doc = M.create('classic');
  f.publication.publish('theme', { document: doc, revision: 0 });
  const created = await f.bridge.install({ published: 'theme', source: '游戏源' }, origin);
  const baseline = f.fake.calls.length;
  doc.layers.find(layer => layer.type === 'text').text = '只改文字';
  f.publication.publish('theme', { document: doc, revision: 1 }); await f.bridge.managed.settled();
  assert(!f.fake.calls.slice(baseline).some(call => ['SetSceneItemTransform', 'SetSceneItemEnabled', 'SetInputSettings', 'SetSceneItemIndex'].includes(call.type)));
  const game = f.fake.items[created.sceneName].find(item => item.sourceName === '游戏源');
  game.sceneItemTransform.positionX = 999;
  const beforeRestore = f.fake.calls.length;
  f.publication.publish('theme', { document: doc, revision: 2 }); await f.bridge.managed.settled();
  assert.equal(game.sceneItemTransform.positionX, doc.layers.find(layer => layer.type === 'game').x * 4 / 3);
  assert.equal(f.fake.calls.slice(beforeRestore).filter(call => call.type === 'SetSceneItemTransform').length, 1);
});

test('a fixed managed source follows full-scene and chat-only scope in both directions without changing its URL', async t => {
  const f = fixture(t), doc = M.create('classic');
  f.publication.publish('theme', { document: doc, revision: 0 });
  const created = await f.bridge.install({ published: 'theme', source: '游戏源' }, origin);
  const url = f.fake.settings[created.inputName].url, chat = doc.layers.find(layer => layer.type === 'chat');
  chat.w = 320; chat.h = 640;
  f.publication.publish('theme', { document: doc, revision: 1, output: 'chat', chatId: chat.id }); await f.bridge.managed.settled();
  assert.equal(f.fake.settings[created.inputName].width, 320);
  assert.equal(f.fake.settings[created.inputName].height, 640);
  assert(!f.fake.items[created.sceneName].some(item => item.sourceName === '游戏源'));
  assert(f.fake.inputs.some(input => input.inputName === '游戏源'), 'only the managed scene reference is removed');
  f.publication.publish('theme', { document: doc, revision: 2, output: 'scene' }); await f.bridge.managed.settled();
  assert.equal(f.fake.settings[created.inputName].width, 1920); assert.equal(f.fake.settings[created.inputName].height, 1080);
  assert(f.fake.items[created.sceneName].some(item => item.sourceName === '游戏源'));
  assert.equal(f.fake.settings[created.inputName].url, url);
  assert.equal(f.bridge.managed.state().targets[0].phase, 'synced');
});
