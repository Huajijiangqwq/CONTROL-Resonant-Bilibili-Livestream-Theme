'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const M = require('../app/theme-editor-model');
const { createThemePublish } = require('../app/theme-publish-server');
const { createPreviewServer } = require('../app/preview-server');

test('applied themes are durable checkpoints and drafts cannot mutate a published document', t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-publish-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const service = createThemePublish({ dataRoot, model: () => M });
  const document = M.create('classic');
  document.settings.liveSession = 'private-cookie';
  assert.equal(service.snapshot('theme').document, null);
  const value = service.publish('theme', { revision: 0, document, name: '直播版本 A' });
  assert.equal(value.revision, 1);
  assert.equal(value.document.settings.liveSession, undefined);
  document.layers[0].x = -42;
  assert.notEqual(service.snapshot('theme').document.layers[0].x, -42);
  assert.equal(service.snapshot('chat').document, null);
  const restarted = createThemePublish({ dataRoot, model: () => M });
  assert.equal(restarted.snapshot('theme').name, '直播版本 A');
  assert.equal(restarted.snapshot('theme').revision, 1);
  assert.throws(() => service.publish('theme', { revision: 0, document }), error => error.status === 409);
  assert.equal(service.snapshot('theme').revision, 1);
  assert(require('../scripts/package').excluded('app/theme-live/published.json'));
});

test('stable publication SSE updates an independent origin, resumes after disconnect, and rejects foreign writes', async t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-publish-http-'));
  const app = createPreviewServer({ port: 0, dataRoot });
  t.after(async () => { app.server.closeAllConnections(); await app.close(); fs.rmSync(dataRoot, { recursive: true, force: true }); });
  const { port } = await app.listen(), base = `http://127.0.0.1:${port}`, alternate = `http://localhost:${port}`;
  const post = (document, revision, origin = base) => fetch(base + '/api/theme-publish/theme', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, document, name: '测试主题' }),
  });
  const event = async reader => {
    let result = ''; while (!result.includes('\n\n')) result += new TextDecoder().decode((await reader.read()).value);
    return result;
  };
  let response = await fetch(alternate + '/api/theme-publish/theme/events', { signal: AbortSignal.timeout(10000) });
  let reader = response.body.getReader();
  assert.match(await event(reader), /"document":null/);
  const document = M.create('split');
  assert.equal((await post(document, 0)).status, 200);
  assert.match(await event(reader), /"revision":1/);
  document.name = '修改了但未应用';
  assert.equal((await (await fetch(alternate + '/api/theme-publish/theme')).json()).revision, 1);
  document.layers.find(l => l.type === 'normal').x = 912;
  assert.equal((await post(document, 1)).status, 200);
  assert.match(await event(reader), /"x":912/);
  await reader.cancel();
  response = await fetch(alternate + '/api/theme-publish/theme/events', { signal: AbortSignal.timeout(5000) });
  reader = response.body.getReader();
  assert.match(await event(reader), /"revision":2/);
  await reader.cancel();
  assert.equal((await post(document, 1)).status, 409);
  assert.equal((await post(document, 2, 'https://example.org')).status, 403);
  assert.equal((await fetch(base + '/theme-live/published.json')).status, 404);
  assert.equal((await fetch(base + '/api/theme-publish/not-a-channel')).status, 404);
});

test('chat publication rejects a missing or hidden explicit target without replacing the live checkpoint', t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-chat-publish-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const service = createThemePublish({ dataRoot, model: () => M }), doc = M.create('classic');
  service.publish('theme', { revision: 0, document: doc });
  assert.throws(() => service.publish('theme', { revision: 1, document: doc, output: 'chat', chatId: 'deleted-chat' }), /删除/);
  doc.layers.find(layer => layer.type === 'chat').visible = false;
  assert.throws(() => service.publish('theme', { revision: 1, document: doc, output: 'chat', chatId: 'chat' }), /隐藏/);
  assert.equal(service.snapshot('theme').revision, 1);
});

test('an older applied theme just above the new write limit still loads for display and rescue', t => {
  const prefix = path.join(os.tmpdir(), 'control-publegacy-'), dataRoot = fs.mkdtempSync(prefix), V = require('../app/theme-document-validation');
  t.after(() => { assert(dataRoot.startsWith(prefix)); fs.rmSync(dataRoot, { recursive: true, force: true }); });
  const document = M.create('classic'), data = 'data:image/png;base64,';
  for (let i = 0; i < 4; i++) document.layers.push(M.layer({ id: 'legacy-media-' + i, type: 'image', src: data + 'AAAA' }));
  const remaining = V.maxBytes + 4096 - Buffer.byteLength(JSON.stringify(document)), portion = Math.floor(remaining / 4);
  for (let i = 0; i < 4; i++) document.layers.at(-4 + i).src += String.fromCharCode(97 + i).repeat(i === 3 ? remaining - portion * 3 : portion);
  fs.mkdirSync(path.join(dataRoot, 'theme-live'));
  fs.writeFileSync(path.join(dataRoot, 'theme-live', 'published.json'), JSON.stringify({ theme: { revision: 7, name: '旧版本已应用主题', document, output: 'scene', chatId: '' } }));
  const service = createThemePublish({ dataRoot, model: () => M });
  assert.equal(service.snapshot('theme').revision, 7);
  assert.equal(service.snapshot('theme').document.layers.at(-1).src.length, document.layers.at(-1).src.length);
  assert.throws(() => service.publish('theme', { document, revision: 7 }), /容量/);
  assert.equal(service.snapshot('theme').revision, 7);
});
