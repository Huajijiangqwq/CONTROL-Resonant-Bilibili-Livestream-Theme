'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const root = path.resolve(__dirname, '../app'),
  M = require(path.join(root, 'theme-editor-model.js')),
  Fake = require('./fixtures/fake-obs'),
  { createObsBridge } = require(path.join(root, 'obs-bridge'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiss-sync-test-')),
  fake = new Fake();
let bridge = createObsBridge({ root: temp, connection: fake, model: () => M });
const checks = [],
  ok = (name, yes) => {
    assert(yes, name);
    checks.push(name);
  },
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  writer = 'test-writer',
  origin = 'http://127.0.0.1:8791';
require('node:test')('OBS binding, geometry and continuity regressions', async () => {
  try {
    const doc = M.create('classic'),
      installed = await bridge.install({ document: doc, source: '游戏源' }, origin),
      t = await bridge.live.targets();
    ok(
      'Discovers existing theme browser in its scene',
      t.some((v) => v.sceneName === installed.sceneName),
    );
    const state = await bridge.live.bind(
        { ...installed, source: '游戏源', document: doc, writer },
        origin,
      ),
      s = bridge.live.get(state.id);
    await s.frame;
    const url = fake.settings[state.inputName].url,
      game = doc.layers.find((l) => l.type === 'game'),
      baseSet = fake.calls.filter((c) => c.type === 'SetInputSettings').length;
    ok(
      'Initial live binding initializes URL exactly once',
      baseSet === 1 && url.includes('live=' + state.id),
    );
    const modified = structuredClone(doc);
    modified.layers.find((l) => l.id === game.id).x += 100;
    modified.layers.find((l) => l.type === 'text').text = '实时修改成功';
    await bridge.live.update({ id: s.id, writer, sequence: 1, document: modified, duration: 0 });
    await s.frame;
    const item = () => fake.items[s.sceneName].find((i) => i.sceneItemId === s.gameItems[game.id]);
    ok(
      'Moves capture to current edited geometry',
      Math.abs(item().sceneItemTransform.positionX - ((game.x + 100) * 4) / 3) < 0.01,
    );
    ok(
      'Updates text without browser settings refresh',
      s.document.layers.some((l) => l.text === '实时修改成功') &&
        fake.settings[s.inputName].url === url &&
        fake.calls.filter((c) => c.type === 'SetInputSettings').length === baseSet,
    );
    await bridge.live.update({ id: s.id, writer, sequence: 1, document: doc });
    ok(
      'Stale sequence cannot roll back newer edits',
      s.document.layers.find((l) => l.id === game.id).x === game.x + 100,
    );
    await assert.rejects(
      bridge.live.update({ id: s.id, writer: 'another-writer', sequence: 2, document: doc }),
      /其他编辑器/,
    );
    checks.push('Competing editor cannot overwrite active scene');
    await bridge.live.update({ id: s.id, writer, sequence: 2, document: doc, duration: 600 });
    await wait(260);
    const mid = item().sceneItemTransform.positionX;
    ok(
      'Layout switch traverses intermediate OBS positions',
      mid > (game.x * 4) / 3 && mid < ((game.x + 100) * 4) / 3,
    );
    const rev = s.revision;
    await bridge.live.pause({ id: s.id, writer });
    ok(
      'Pause freezes both geometry and broadcasts fresh revision',
      s.revision > rev &&
        !s.enabled &&
        Math.abs(
          item().sceneItemTransform.positionX -
            (s.document.layers.find((l) => l.id === game.id).x * 4) / 3,
        ) < 0.01,
    );
    await assert.rejects(
      bridge.live.update({ id: s.id, writer, sequence: 3, document: doc }),
      /暂停/,
    );
    checks.push('Paused binding does not accept edits');
    await bridge.live.bind({ id: s.id, writer, document: doc }, origin);
    await s.frame;
    ok(
      'Resume preserves browser URL',
      fake.calls.filter((c) => c.type === 'SetInputSettings').length === baseSet,
    );
    const hidden = structuredClone(doc);
    hidden.layers.find((l) => l.id === game.id).visible = false;
    await bridge.live.update({ id: s.id, writer, sequence: 1, document: hidden });
    await s.frame;
    ok('Game visibility follows layer visibility', item().sceneItemEnabled === false);
    const extra = structuredClone(doc);
    extra.layers.push({ ...game, id: 'extra-game', x: 900, w: 400, h: 225 });
    await bridge.live.update({ id: s.id, writer, sequence: 2, document: extra });
    await s.frame;
    ok('Duplicate game layer creates a source instance', s.gameItems['extra-game'] !== undefined);
    await bridge.live.update({ id: s.id, writer, sequence: 3, document: doc });
    await s.frame;
    ok(
      'Deleting layer removes its scene item only',
      s.gameItems['extra-game'] === undefined && fake.inputs.some((i) => i.inputName === '游戏源'),
    );
    const chat = doc.layers.find((l) => l.type === 'chat'),
      ci = await bridge.install({ document: doc, output: 'chat', chatId: chat.id }, origin),
      cb = await bridge.live.bind(
        { ...ci, document: doc, output: 'chat', chatId: chat.id, writer },
        origin,
      ),
      cs = bridge.live.get(cb.id);
    await cs.frame;
    const narrower = structuredClone(doc);
    narrower.layers.find((l) => l.id === chat.id).w -= 70;
    const chatSet = fake.calls.filter((c) => c.type === 'SetInputSettings').length;
    await bridge.live.update({ id: cs.id, writer, sequence: 1, document: narrower });
    await cs.frame;
    const chatItem = fake.items[cs.sceneName].find((i) => i.sceneItemId === cs.browserItem);
    ok(
      'Chat resizes by viewport crop without browser restart',
      chatItem.sceneItemTransform.cropRight === 1920 - Math.ceil(chat.w - 70) &&
        fake.calls.filter((c) => c.type === 'SetInputSettings').length === chatSet,
    );
    fake.collection = '另一个集合';
    await assert.rejects(
      bridge.live.update({ id: s.id, writer, sequence: 4, document: doc }),
      /集合已切换/,
    );
    ok('Scene collection change stops updates', !s.enabled);
    fake.collection = '测试集合';
    await bridge.live.bind({ id: s.id, writer, document: modified }, origin);
    await s.frame;
    bridge.close();
    bridge = createObsBridge({ root: temp, connection: fake, model: () => M });
    const restored = bridge.live.get(s.id);
    ok(
      'Service restart persists latest content but awaits explicit resume',
      !restored.enabled && restored.document.layers.some((l) => l.text === '实时修改成功'),
    );
    ok(
      'Never changes program scene or recording',
      !fake.calls.some((c) =>
        /^(SetCurrentProgramScene|StartRecord|StopRecord|StartStream|StopStream)$/.test(c.type),
      ),
    );
    assert.equal(checks.length, 17);
  } finally {
    bridge.close();
    if (!temp.startsWith(path.join(os.tmpdir(), 'hiss-sync-test-'))) throw Error('Unsafe cleanup');
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
