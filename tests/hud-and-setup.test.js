'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const M = require('../app/theme-editor-model'), L = require('../app/live-state');
const { createSetup, download, verified } = require('../app/now-playing-setup');

test('fullscreen note is opt-in and survives OBS URLs; independent HUD survives export', () => {
  assert.equal(L.normalize({}).splitTopic, false);
  const state = L.normalize({ splitTopic: true, topic: '测试备注' });
  assert.equal(L.fromQuery(new URLSearchParams(L.query(state)), {}).splitTopic, true);
  for (const mode of ['classic', 'game', 'split']) {
    const d = M.normalize(JSON.parse(JSON.stringify(M.create(mode))));
    assert(!d.layers.some(l => l.type === 'header'));
    assert.equal(d.layers.find(l => l.type === 'topic').visible, mode !== 'split');
    for (const type of ['host', 'topic', 'status']) assert(d.layers.some(l => l.type === type));
    const host = d.layers.find(l => l.type === 'host'), status = d.layers.find(l => l.type === 'status');
    host.x = 100; host.headerHostSize = 39;
    const roundtrip = M.normalize(d);
    assert.equal(roundtrip.layers.find(l => l.id === host.id).headerHostSize, 39);
    assert.equal(roundtrip.layers.find(l => l.id === status.id).x, status.x);
  }
  const legacy = M.layer({ type: 'header', headerTopicVisible: false, opacity: 0.6, rotation: 10 });
  const parts = M.detachHeader(legacy, { host: { x: 120, y: 33, w: 400, h: 50, headerHostSize: 35 } });
  assert.equal(parts.find(l => l.type === 'topic').visible, false);
  assert.equal(parts[0].opacity, 0.6);
  assert.equal(parts[0].rotation, 10);
  assert.equal(parts[0].x, 120);
});

test('upstream download checks exact size and SHA before making installer available', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-setup-'));
  try {
    const file = path.join(root, 'setup.exe'), bytes = Buffer.from('official fixture');
    const spec = { url: 'https://example.invalid/fixture', size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    let calls = 0;
    const request = async () => { calls++; return { ok: true, body: [bytes] }; };
    await download(file, () => {}, new AbortController().signal, request, spec);
    assert.equal(await verified(file, spec), true);
    await download(file, () => {}, new AbortController().signal, request, spec);
    assert.equal(calls, 1, 'verified cache avoids duplicate download');
    const invalid = path.join(root, 'bad.exe');
    await assert.rejects(download(invalid, () => {}, new AbortController().signal, async () => ({ ok: true, body: [Buffer.alloc(bytes.length)] }), spec), /校验失败/);
    assert(!fs.existsSync(invalid)); assert(!fs.existsSync(invalid + '.part'));
    await assert.rejects(download(invalid, () => {}, new AbortController().signal, async () => ({ ok: true, body: [Buffer.alloc(bytes.length + 1)] }), spec), /大小不符/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('setup reuses installed service, serializes clicks and saves only after API is ready', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-setup-'));
  let launched = 0, stopped = 0, configured = 0, ready = false;
  fs.writeFileSync(path.join(root, 'NowPlayingService.exe'), 'fixture');
  const setup = createSetup({ root: path.join(root, 'data'), platform: 'win32',
    locate: async () => root, installPackage: async () => assert.fail('must not reinstall'),
    launch() { launched++; ready = true; return Object.assign(new EventEmitter(), { exitCode: null, kill: () => stopped++ }); },
    request: async () => ({ ok: ready, json: async () => ({ player: { hasSong: false }, track: {} }) }),
    configure: async (url, managed) => { assert(ready); assert(managed); assert.equal(url, 'http://127.0.0.1:9863'); configured++; },
  });
  try {
    const a = setup.start(), b = setup.start();
    assert.equal(a, b);
    await a;
    assert.equal(launched, 1); assert.equal(configured, 1); assert.equal(setup.snapshot().phase, 'ready');
    await setup.start(); assert.equal(launched, 1);
    setup.close(); assert.equal(stopped, 1);
  } finally { setup.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('installer endpoint rejects foreign origins and missing capability token', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-setup-api-'));
  const service = require('../app/now-playing-server').createService({ port: 0, settingsFile: path.join(root, 'settings.json'),
    capturePath: path.join(root, 'missing.exe'), defaultProvider: 'builtin',
    mediaProvider: { read: () => ({ track: {}, error: '' }), close() {}, stop() {}, cover() {} },
  });
  try {
    const addr = await service.listen(), base = 'http://127.0.0.1:' + addr.port;
    const route = base + '/api/external-setup';
    assert.equal((await fetch(route, { headers: { Origin: 'https://example.org' } })).status, 403);
    assert.equal((await fetch(route)).status, 403);
    const r = await fetch(route, { headers: { Origin: base } });
    assert.equal(r.status, 200); assert((await r.json()).token);
    assert.equal((await fetch(route, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  } finally { service.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
